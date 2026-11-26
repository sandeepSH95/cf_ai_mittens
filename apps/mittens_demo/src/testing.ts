/**
 * The testing entry. The verifier's contract, section 3, defines it.
 *
 *   openGate()         -> exports.GitHubGate, backed by the demo's default stub driver
 *   openGate(source)   -> the same gate, backed by the fixture text and a fixed clock
 *
 * It hands out the same loopback handle the agent gives to the sandbox:
 * GitHubGate has read methods only. Nothing here replaces the gate.
 *
 * Not written yet: agentParts() and runScriptedCase(input).
 */
import { exports } from "cloudflare:workers";
import type { FacadeSource } from "./services/facade";

const TESTING_RUN_ID = "testing";

/** Example: openGate({ fixture: "<JSON text of a fixture file>", now: "2026-11-01T00:00:00Z" }). */
export function openGate(source?: FacadeSource): Fetcher {
  const props = source === undefined ? { runId: TESTING_RUN_ID } : { runId: TESTING_RUN_ID, source };

  return exports.GitHubGate({ props });
}
