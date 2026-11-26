/**
 * Mittens.
 *
 *   Browser (useAgentChat) --WS--> Worker --routeAgentRequest--> CoderAgent (Durable Object, AIChatAgent)
 *   "close my stale PRs"                                            |
 *                                                                   |  streamText({ model, tools: { code, apply_writes }, stopWhen: stepCountIs(6) })
 *                                                                   |
 *            +------------------------------------------------------+----------------------------------------+
 *            |  code tool -> createSandbox() (package mittens_sandbox)                                       |
 *            |    env.LOADER.load({ modules: { main.js: shim, program.js: <model code> },                     |
 *            |                      env: { GH: ctx.exports.GitHubGate({ props: { runId } }) },               |
 *            |                      globalOutbound: null, limits: { cpuMs } })                               |
 *            |                                                                                               |
 *            |    FRESH V8 ISOLATE PER RUN | fetch() throws | env has only GH | tick budget + timeout        |
 *            |    const prs = await github.listPullRequests({ state: "open" }); ... return { plan }          |
 *            +------------------------------------------------------+----------------------------------------+
 *                                                                   |  RPC only: no byte of the token crosses this line
 *                                                                   v
 *   GitHubGate (src/gate.ts, host side)  READ methods -> Facade -> GitHubDriver(env.GITHUB_TOKEN)
 *   apply_writes (needsApproval) ------> human Approve -> applyPlan -> GitHubDriver write methods
 *   SQLite: chat messages (AIChatAgent) | ledger(facade_calls, round_trips, isolate_start_ms, tokens)
 */
import { AIChatAgent } from "@cloudflare/ai-chat";
import { routeAgentRequest } from "agents";
import { wrapAISDK } from "agents/observability/ai";
import * as ai from "ai";
import { convertToModelMessages, stepCountIs, type StepResult, type ToolSet } from "ai";
import { deniedAsResponded } from "./services/denial";
import { Ledger, type LedgerRow } from "./services/ledger";
import { prepareTurn } from "./services/turn";

// The gate must be a top-level export of the main module so ctx.exports.GitHubGate exists.
export { GitHubGate } from "./gate";

const { streamText } = wrapAISDK(ai);

const LEDGER_ROUTE = "ledger";
const HTTP_NOT_FOUND = 404;

export type CoderState = {
  lastProgram: string | null;
  lastLedger: LedgerRow | null;
  runs: number;
  modelId: string | null;
};

type ChatOptions = Parameters<AIChatAgent<Env, CoderState>["onChatMessage"]>[1];

export class CoderAgent extends AIChatAgent<Env, CoderState> {
  initialState: CoderState = { lastProgram: null, lastLedger: null, runs: 0, modelId: null };
  #ledger: Ledger | undefined;

  async onChatMessage(_onFinish: ai.GenerateTextOnFinishCallback<ToolSet>, options?: ChatOptions): Promise<Response> {
    const runId = options?.requestId ?? crypto.randomUUID();
    const ledger = this.#ledgerStore();

    // Ledger rows written during the current step; usage is attached when the step ends.
    const recorded: number[] = [];

    const turn = prepareTurn(this.env, {
      gate: this.ctx.exports.GitHubGate({ props: { runId, scope: this.name } }),
      ledger,
      scope: this.name,
      onRecorded: (row) => {
        recorded.push(row.id);
        this.setState({ lastProgram: row.program, lastLedger: row, runs: this.state.runs + 1, modelId: turn.modelId });
      }
    });

    const result = streamText({
      model: turn.model,
      system: turn.system,

      // A rejected apply_writes must reach the model as "execution-denied" (GATE-002).
      messages: await convertToModelMessages(deniedAsResponded(this.messages), { tools: turn.tools }),
      tools: turn.tools,
      stopWhen: stepCountIs(turn.stepLimit),
      abortSignal: options?.abortSignal,
      onStepFinish: (step) => this.#attachUsage(ledger, recorded.splice(0), step)
    });

    // The default text is "An error occurred.". The human must read why a plan was refused or a program failed.
    return result.toUIMessageStreamResponse({ onError: errorText });
  }

  /** GET .../ledger returns the state and the last ledger rows. Other paths fall through. */
  async onRequest(request: Request): Promise<Response> {
    const lastSegment = new URL(request.url).pathname.split("/").pop();

    if (lastSegment === LEDGER_ROUTE) {
      return Response.json({ state: this.state, ledger: this.#ledgerStore().list() });
    }

    return new Response("not found", { status: HTTP_NOT_FOUND });
  }

  #ledgerStore(): Ledger {
    this.#ledger ??= new Ledger(this.ctx.storage.sql);
    return this.#ledger;
  }

  #attachUsage(ledger: Ledger, ids: number[], step: StepResult<ToolSet>): void {
    const usage = { inputTokens: step.usage.inputTokens, outputTokens: step.usage.outputTokens };

    for (const id of ids) {
      ledger.attachUsage(id, usage);
    }

    const last = this.state.lastLedger;

    if (last !== null && ids.includes(last.id)) {
      this.setState({ ...this.state, lastLedger: { ...last, tokensIn: usage.inputTokens ?? null, tokensOut: usage.outputTokens ?? null } });
    }
  }
}

/** Example: a PlanRefusal becomes "Plan refused: 26 writes, the limit is 25". */
function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    return (await routeAgentRequest(request, env)) ?? new Response("not found", { status: HTTP_NOT_FOUND });
  }
} satisfies ExportedHandler<Env>;
