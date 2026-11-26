/**
 * The testing entry. The verifier's contract, section 3, defines it.
 *
 *   openGate()         -> exports.GitHubGate, backed by the demo's default stub driver
 *   openGate(source)   -> the same gate, backed by the fixture text and a fixed clock
 *
 * It hands out the same loopback handle the agent gives to the sandbox:
 * GitHubGate has read methods only. Nothing here replaces the gate.
 *
 *   agentParts()       -> the reads, the writes, the tool names and the step limit,
 *                         from the same service call the agent makes for a turn
 *
 *   runScriptedCase(input) -> one turn of the real CoderAgent, then a report
 *
 *   runScriptedCase
 *     |  replaceDrivers(agentName, { github: stub over the fixture, model: the script })
 *     |  AgentClient: user message --> [approval answer] --> messages, ledger, state
 *     v
 *   report: each value is read from what the agent path left behind
 *     chat messages (code and apply_writes tool parts)  program_result, plan, apply_outcome, refusal
 *     ledger route                                      ledger, agent_state
 *     the stub                                          stub_writes, driver_calls
 *     the scripted model's last prompt                  model_received
 */
import { env, exports } from "cloudflare:workers";
import { ToolName } from "mittens_gate";
import { AgentClient, type ChatMessage, type ChatPart, type WorkerFetcher } from "./drivers/agent-client";
import { StubGitHubDriver, type StubWrite } from "./drivers/github-stub";
import { ScriptedModelDriver, type ScriptStep } from "./drivers/model";
import type { CoderState } from "./server";
import { createRecordedExecutor } from "./services/executor";
import type { FacadeSource } from "./services/facade";
import type { LedgerRow } from "./services/ledger";
import { replaceDrivers, restoreDrivers } from "./services/seam";
import { createGateParts, type GateParts } from "./services/turn";

const TESTING_RUN_ID = "testing";

const Approval = { Approve: "approve", Reject: "reject" } as const;
type Approval = (typeof Approval)[keyof typeof Approval];

/** The states of a tool part in a stored chat message (AI SDK UI message parts). */
const PartState = { ApprovalRequested: "approval-requested", OutputAvailable: "output-available", OutputError: "output-error" } as const;
const TOOL_PART_PREFIX = "tool-";

/** Example: openGate({ fixture: "<JSON text of a fixture file>", now: "2026-11-01T00:00:00Z" }). */
export function openGate(source?: FacadeSource): Fetcher {
  const props = source === undefined ? { runId: TESTING_RUN_ID } : { runId: TESTING_RUN_ID, source };

  return exports.GitHubGate({ props });
}

export type AgentParts = Pick<GateParts, "reads" | "writes" | "stepLimit"> & { toolNames: string[] };

/** Example: agentParts().toolNames is ["code", "apply_writes"]. No program runs here; the executor only completes the tool set. */
export function agentParts(): AgentParts {
  const executor = createRecordedExecutor(env, { gate: openGate() });
  const { reads, writes, tools, stepLimit } = createGateParts(env, executor);

  return { reads, writes, toolNames: Object.keys(tools), stepLimit };
}

export type ScriptedCase = {
  agentName: string;
  fixture: string;
  now: string | null;
  userMessage: string | null;
  script: ScriptStep[];
  approval: Approval | null;
};

/** A ledger row as the contract names its keys. */
export type ReportLedger = { facade_calls: number; round_trips: number; error: string | null; isolate_start_ms: number | null };

export type ScriptedReport = {
  program_result: unknown;
  plan: unknown;
  ledger: ReportLedger | null;
  apply_outcome: { applied: number; failed: number } | null;
  stub_writes: readonly StubWrite[];
  refusal: string | null;
  model_received: string | null;
  driver_calls: number;
  agent_state: { last_program: string | null; last_ledger: ReportLedger | null; runs: number };
};

type LedgerRoute = { state: CoderState; ledger: LedgerRow[] };
type CodeOutput = { result?: unknown } | null | undefined;
type ApplyOutput = { applied?: unknown[]; failed?: unknown[] } | null | undefined;

/**
 * Runs one turn of the real agent named `agentName`. Two things are replaced:
 * the model plays `script`, and GitHub is a stub over `fixture`.
 * Example: runScriptedCase({ agentName: "case-1", fixture, now: "2026-11-01T00:00:00Z", userMessage: "Close my stale pull requests",
 *   script: [{ tool: "code", program }, { tool: "apply_writes" }, { text: "done" }], approval: "approve" }).
 */
export async function runScriptedCase(input: ScriptedCase): Promise<ScriptedReport> {
  const github = new StubGitHubDriver({ fixture: input.fixture, now: input.now });
  const model = new ScriptedModelDriver(input.script, { codeTool: ToolName.Code, applyTool: ToolName.ApplyWrites });

  replaceDrivers(input.agentName, { github, model });

  const worker = exports.default as unknown as WorkerFetcher;
  const client = await AgentClient.connect(worker, input.agentName);

  try {
    await playTurn(client, input);

    const messages = await client.messages();
    const ledgerRoute = (await client.ledger()) as LedgerRoute;

    return buildReport({ messages, ledgerRoute, github, model });
  } finally {
    client.close();
    restoreDrivers(input.agentName);
  }
}

/** Sends the user message. When apply_writes then waits for the human, gives the answer of the case. */
async function playTurn(client: AgentClient, input: ScriptedCase): Promise<void> {
  if (input.userMessage === null) {
    return;
  }

  await client.say(input.userMessage);

  if (input.approval === null) {
    return;
  }

  const pending = lastToolPart(await client.messages(), ToolName.ApplyWrites);

  if (pending?.state !== PartState.ApprovalRequested || pending.toolCallId === undefined) {
    return;
  }

  await client.answer(pending.toolCallId, input.approval === Approval.Approve);
}

type ReportSources = { messages: ChatMessage[]; ledgerRoute: LedgerRoute; github: StubGitHubDriver; model: ScriptedModelDriver };

function buildReport(sources: ReportSources): ScriptedReport {
  const { state, ledger } = sources.ledgerRoute;
  const programResult = programResultOf(lastToolPart(sources.messages, ToolName.Code));
  const applyPart = lastToolPart(sources.messages, ToolName.ApplyWrites);

  return {
    program_result: programResult,
    plan: (programResult as { plan?: unknown } | null)?.plan ?? null,

    // The route lists the newest row first.
    ledger: reportLedger(ledger[0] ?? null),
    apply_outcome: applyOutcomeOf(applyPart),
    stub_writes: sources.github.receivedWrites(),
    refusal: applyPart?.state === PartState.OutputError ? (applyPart.errorText ?? null) : null,
    model_received: sources.model.lastOutputType(ToolName.ApplyWrites),
    driver_calls: sources.github.readCalls(),
    agent_state: { last_program: state.lastProgram, last_ledger: reportLedger(state.lastLedger), runs: state.runs }
  };
}

/** The last part of one tool in the chat. Example: lastToolPart(messages, "code") is the part "tool-code" of the last program run. */
function lastToolPart(messages: ChatMessage[], toolName: string): ChatPart | undefined {
  return messages
    .flatMap((message) => message.parts)
    .findLast((part) => part.type === `${TOOL_PART_PREFIX}${toolName}`);
}

// The code tool answers { result, logs }. A failed program has no output: the report then holds null.
function programResultOf(part: ChatPart | undefined): unknown {
  if (part?.state !== PartState.OutputAvailable) {
    return null;
  }

  return (part.output as CodeOutput)?.result ?? null;
}

// Counts what the apply tool answered. A rejected or refused plan has no output: null.
function applyOutcomeOf(part: ChatPart | undefined): ScriptedReport["apply_outcome"] {
  if (part?.state !== PartState.OutputAvailable) {
    return null;
  }

  const output = part.output as ApplyOutput;

  return { applied: output?.applied?.length ?? 0, failed: output?.failed?.length ?? 0 };
}

function reportLedger(row: LedgerRow | null): ReportLedger | null {
  if (row === null) {
    return null;
  }

  return { facade_calls: row.facadeCalls, round_trips: row.roundTrips, error: row.error, isolate_start_ms: row.isolateStartMs };
}
