/**
 * Runs one program through the real sandbox driver inside workerd.
 *
 * The gate binding only exists as a loopback stub from ctx.exports, so the
 * run happens inside a CoderAgent Durable Object (runInDurableObject gives
 * us its DurableObjectState). The agent instance itself is not used.
 */
import { env, runInDurableObject } from "cloudflare:test";
import { createAgentTools, ToolName } from "mittens_gate";
import type { CoderAgent } from "../src/server";
import { createRecordedExecutor } from "../src/services/executor";
import { Ledger, type LedgerRow, type ProgramRun } from "../src/services/ledger";

export const TEST_RUN_ID = "test-run";
const SANDBOX_AGENT = "sandbox-tests";

export type RunOptions = { timeoutMs?: number; tickBudget?: number };
export type LedgerOutcome = { run: ProgramRun; row: LedgerRow | null };

export function runProgram(code: string, options: RunOptions = {}): Promise<ProgramRun> {
  return inAgent(async (state) => {
    const gate = state.exports.GitHubGate({ props: { runId: TEST_RUN_ID } });
    const sandbox = createRecordedExecutor(env, { gate, limits: options });
    return sandbox.run(code);
  });
}

/** Same as runProgram, but records the run in a Ledger on the agent's SQLite. */
export function runRecorded(code: string): Promise<LedgerOutcome> {
  return inAgent(async (state) => {
    const ledger = new Ledger(state.storage.sql);
    const gate = state.exports.GitHubGate({ props: { runId: TEST_RUN_ID } });
    const sandbox = createRecordedExecutor(env, { gate, onRun: (run) => ledger.recordRun(run) });
    const run = await sandbox.run(code);
    return { run, row: ledger.latest() };
  });
}

/**
 * Runs code the way the agent does: through the `code` tool from createCodeTool
 * (which normalizes the code and turns executor errors into a thrown Error).
 */
export function runThroughCodeTool(code: string): Promise<unknown> {
  return inAgent(async (state) => {
    const gate = state.exports.GitHubGate({ props: { runId: TEST_RUN_ID } });
    const executor = createRecordedExecutor(env, { gate });
    const tools = createAgentTools({ executor, applyPlan: async () => ({ applied: [], failed: [] }) });
    const codeTool = tools[ToolName.Code];

    if (codeTool.execute === undefined) {
      throw new Error("code tool has no execute");
    }

    return codeTool.execute({ code }, { toolCallId: "test-call", messages: [], context: undefined });
  });
}

export function inAgent<T>(callback: (state: DurableObjectState) => Promise<T>): Promise<T> {
  const stub = env.CoderAgent.get(env.CoderAgent.idFromName(SANDBOX_AGENT));
  return runInDurableObject(stub, (_agent: CoderAgent, state) => callback(state));
}
