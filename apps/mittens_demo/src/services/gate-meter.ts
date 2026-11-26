/**
 * The gate meter: counts the gate calls of one program run, on the host.
 *
 *   isolate                         host
 *   github.listPullRequests(x) --+
 *                                +--> GitHubGate.listPullRequests --> reportGateCall --> CoderAgent.countGateCall
 *   env.GH.listPullRequests(x) --+                                                            |
 *                                                                                             v
 *   executor: meter.start() --> sandbox.execute(code) --> meter.read() <------------------ GateMeter
 *
 * The program owns the isolate, so a count made there is a claim of the
 * program: a call through the raw handle skips it. Every call, whatever its
 * path, arrives at GitHubGate. So the count is made there.
 */
import { getAgentByName } from "agents";
import type { CoderAgent } from "../server";

/** `firstCallAt` is a host clock value in milliseconds. Null when the program made no gate call. */
export type GateUse = { calls: number; firstCallAt: number | null };

/** Who made a gate call: the props of the gate handle. Without a scope, no agent waits for the count. */
export type GateCaller = { runId: string; scope?: string };

export type MeterEnv = { CoderAgent: DurableObjectNamespace<CoderAgent> };

export class GateMeter {
  readonly #runId: string;
  #calls = 0;
  #firstCallAt: number | null = null;

  /** `runId` is the id in the props of the gate handle of one turn. */
  constructor(runId: string) {
    this.#runId = runId;
  }

  /** Starts the count of one program. One turn can run several programs through one gate handle. */
  start(): void {
    this.#calls = 0;
    this.#firstCallAt = null;
  }

  /** Counts one call. A call from the handle of an earlier turn has another run id and is left out. */
  count(runId: string): void {
    if (runId !== this.#runId) {
      return;
    }

    this.#calls += 1;
    this.#firstCallAt ??= Date.now();
  }

  read(): GateUse {
    return { calls: this.#calls, firstCallAt: this.#firstCallAt };
  }
}

/**
 * Tells the agent that owns the gate handle about one call.
 * Example: reportGateCall(env, { runId: "r-1", scope: "my-chat" }) reaches the agent named "my-chat".
 */
export async function reportGateCall(env: MeterEnv, caller: GateCaller): Promise<void> {
  if (caller.scope === undefined) {
    return;
  }

  const agent = await getAgentByName(env.CoderAgent, caller.scope);

  await agent.countGateCall(caller.runId);
}
