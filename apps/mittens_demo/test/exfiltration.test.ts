/**
 * Covers KCM-001 (no network), KCM-002 (no token in the isolate), KCM-005 (runaway programs stop).
 *
 * Every program here is hand-written malicious code (package mittens_attack)
 * loaded through the real sandbox driver inside workerd. The assertions are
 * on what the isolate returned or on the error the driver reported, not on mocks.
 */
import { env } from "cloudflare:test";
import { CANARY_GITHUB_TOKEN, runAttack, type AttackName, type AttackOutcome, type ExecutorFactory } from "mittens_attack";
import { BUDGET_ERROR_MESSAGE, GATE_BINDING, TIMEOUT_ERROR_MESSAGE } from "mittens_sandbox";
import { describe, expect, it } from "vitest";
import { runProgram } from "./support";

const NETWORK_DENIED = "not permitted to access the internet";
const RUNAWAY_LIMIT_MS = 5_000;

/** The executor under test: the real sandbox, inside the CoderAgent Durable Object. */
const sandboxFor: ExecutorFactory = (limits) => ({ run: (code) => runProgram(code, limits) });

function attack(name: AttackName): Promise<AttackOutcome> {
  return runAttack(sandboxFor, name);
}

describe("KCM-001 generated code cannot reach the network", () => {
  it("fetch() inside the isolate throws", async () => {
    const run = await attack("fetchThrows");

    expect(run.result).toBeUndefined();
    expect(run.error).toContain(NETWORK_DENIED);
  });

  it("a swallowed fetch() still returns no data", async () => {
    const run = await attack("swallowedFetch");

    expect(run.error).toBeNull();
    expect(run.result).toMatchObject({ reached: false });
    expect(String((run.result as { message: string }).message)).toContain(NETWORK_DENIED);
  });
});

describe("KCM-002 the token is not readable from the isolate", () => {
  it("the host does hold the canary token (precondition)", () => {
    // Secrets are not part of the generated Env type; the test runtime injects this one.
    const host = env as { GITHUB_TOKEN?: string };
    expect(host.GITHUB_TOKEN).toBe(CANARY_GITHUB_TOKEN);
  });

  it("env has only the gate binding, GITHUB_TOKEN is undefined, no global carries the token", async () => {
    const run = await attack("inspectEnv");

    expect(run.error).toBeNull();

    const result = run.result as { tokenType: string; envKeys: string[]; globals: string[]; facadeKeys: string[] };
    expect(result.tokenType).toBe("undefined");
    expect(result.envKeys).toEqual([GATE_BINDING]);
    expect(JSON.stringify(result)).not.toContain(CANARY_GITHUB_TOKEN);
    expect(result.globals.some((name) => /token|secret/i.test(name))).toBe(false);
  });

  it("the gate binding exposes no write method even when called directly", async () => {
    const run = await attack("directWrite");

    expect(run.error).toBeNull();
    expect(String(run.result)).toMatch(/^rejected: /);
  });
});

describe("KCM-005 a runaway program is stopped and reported", () => {
  it("a synchronous infinite loop hits the tick budget", async () => {
    const run = await attack("syncLoop");

    expect(run.error).toBe(BUDGET_ERROR_MESSAGE);
    expect(run.durationMs).toBeLessThan(RUNAWAY_LIMIT_MS);
  });

  it("an async infinite loop hits the tick budget", async () => {
    const run = await attack("asyncLoop");

    expect(run.error).toBe(BUDGET_ERROR_MESSAGE);
  });

  it("unbounded recursion ends with an error, not a hang", async () => {
    const run = await attack("recursion");

    expect(run.error).not.toBeNull();
  });

  it("a program that never resolves hits the timeout", async () => {
    const run = await attack("neverResolves");

    expect(run.error).toBe(TIMEOUT_ERROR_MESSAGE);
  });
});
