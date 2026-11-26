/**
 * Covers SBX-001 (no network), SBX-002 (no token in the isolate), GATE-001 (no direct write),
 * SBX-003 (runaway programs stop) and ATK-003 (the suite reports zero breaches against the sandbox).
 *
 * Every program here is hand-written malicious code (package mittens_attack)
 * loaded through the real sandbox driver inside workerd. The assertions are
 * on what the isolate returned or on the error the driver reported, not on mocks.
 */
import { env } from "cloudflare:test";
import { ATTACK_PROGRAMS, attackSandbox, CANARY_GITHUB_TOKEN } from "mittens_attack";
import { BUDGET_ERROR_MESSAGE, GATE_BINDING, TIMEOUT_ERROR_MESSAGE } from "mittens_sandbox";
import { describe, expect, it } from "vitest";
import type { ProgramRun } from "../src/services/ledger";
import { openGate } from "../src/testing";
import { runProgram } from "./support";

const NETWORK_DENIED = "not permitted to access the internet";
const RUNAWAY_LIMIT_MS = 5_000;

/** Limits small enough that a runaway program ends fast. */
const SMALL_LIMITS = { tickBudget: 10_000, timeoutMs: 500 };

/** Runs one attack of the suite, by its name in the report, through the real sandbox. */
function attack(name: string): Promise<ProgramRun> {
  const program = ATTACK_PROGRAMS.find((candidate) => candidate.name === name);

  if (program === undefined) {
    throw new Error(`no attack named ${name}`);
  }

  return runProgram(program.code, SMALL_LIMITS);
}

describe("SBX-001 generated code cannot reach the network", () => {
  it("fetch() inside the isolate throws", async () => {
    const run = await attack("network fetch");

    expect(run.result).toBeNull();
    expect(run.error).toContain(NETWORK_DENIED);
  });

  it("a swallowed fetch() still returns no data", async () => {
    const run = await attack("swallowed fetch");

    expect(run.error).toBeNull();
    expect(run.result).toMatchObject({ reached: false });
    expect(String((run.result as { message: string }).message)).toContain(NETWORK_DENIED);
  });
});

describe("SBX-002 the token is not readable from the isolate", () => {
  it("the host does hold the canary token (precondition)", () => {
    // Secrets are not part of the generated Env type; the test runtime injects this one.
    const host = env as { GITHUB_TOKEN?: string };
    expect(host.GITHUB_TOKEN).toBe(CANARY_GITHUB_TOKEN);
  });

  it("env has only the gate binding, GITHUB_TOKEN is undefined, no global carries the token", async () => {
    const run = await attack("env inspection");

    expect(run.error).toBeNull();

    const result = run.result as { tokenType: string; envKeys: string[]; globals: string[] };
    expect(result.tokenType).toBe("undefined");
    expect(result.envKeys).toEqual([GATE_BINDING]);
    expect(JSON.stringify(result)).not.toContain(CANARY_GITHUB_TOKEN);
    expect(result.globals.some((name) => /token|secret/i.test(name))).toBe(false);
  });
});

describe("GATE-001 the gate handle has read methods only", () => {
  it("a direct call to a write method on the binding is rejected", async () => {
    const run = await attack("direct write call");

    expect(run.error).toBeNull();
    expect(String(run.result)).toMatch(/^rejected: /);
  });

  it("a write method through the github global is rejected too", async () => {
    const run = await runProgram(`async () => github.createComment({ number: 101, body: "leak" })`);

    expect(run.error).not.toBeNull();
    expect(run.result).toBeNull();
  });

  it("a gate opened over a fixture reads that fixture with its clock", async () => {
    const fixture = JSON.stringify({
      repo: { fullName: "fixture/one", description: null, openIssues: 0, defaultBranch: "main" },
      pullRequests: [{ number: 7, title: "t", state: "open", author: "a", createdDaysAgo: 2, updatedDaysAgo: 1, draft: false, labels: [], body: null }],
      issues: [],
      comments: {}
    });
    const gate = openGate({ fixture, now: "2026-11-10T00:00:00.000Z" }) as unknown as { listPullRequests(input: unknown): Promise<{ number: number; updatedAt: string }[]> };

    const pulls = await gate.listPullRequests({ state: "open" });

    expect(pulls.map((pull) => [pull.number, pull.updatedAt])).toEqual([[7, "2026-11-09T00:00:00.000Z"]]);
  });
});

describe("SBX-003 a runaway program is stopped and reported", () => {
  it("a synchronous infinite loop hits the tick budget", async () => {
    const run = await attack("synchronous loop");

    expect(run.error).toBe(BUDGET_ERROR_MESSAGE);
    expect(run.durationMs).toBeLessThan(RUNAWAY_LIMIT_MS);
  });

  it("an async infinite loop hits the tick budget", async () => {
    const run = await attack("asynchronous loop");

    expect(run.error).toBe(BUDGET_ERROR_MESSAGE);
  });

  it("unbounded recursion ends with an error, not a hang", async () => {
    const run = await attack("recursion");

    expect(run.error).not.toBeNull();
  });

  it("a program that never resolves hits the timeout", async () => {
    const run = await attack("never-resolving promise");

    expect(run.error).toBe(TIMEOUT_ERROR_MESSAGE);
  });
});

describe("ATK-003 the suite judges by the canary", () => {
  it("reports zero breaches against the real sandbox", async () => {
    const report = await attackSandbox({ execute: (program) => runProgram(program, SMALL_LIMITS), canary: CANARY_GITHUB_TOKEN });

    expect(report.cases).toHaveLength(ATTACK_PROGRAMS.length);
    expect(report.breached).toBe(0);
  });

  it("reports a breach when the canary is in a log or in a thrown error", async () => {
    const inLog = await attackSandbox({ execute: async () => ({ result: null, error: null, logs: [`token ${CANARY_GITHUB_TOKEN}`] }), canary: CANARY_GITHUB_TOKEN });
    const inThrow = await attackSandbox({ execute: async () => Promise.reject(new Error(CANARY_GITHUB_TOKEN)), canary: CANARY_GITHUB_TOKEN });

    expect(inLog.breached).toBe(ATTACK_PROGRAMS.length);
    expect(inThrow.breached).toBe(ATTACK_PROGRAMS.length);
  });
});
