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
 * Not written yet: runScriptedCase(input).
 */
import { env, exports } from "cloudflare:workers";
import { createRecordedExecutor } from "./services/executor";
import type { FacadeSource } from "./services/facade";
import { createGateParts, type GateParts } from "./services/turn";

const TESTING_RUN_ID = "testing";

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
