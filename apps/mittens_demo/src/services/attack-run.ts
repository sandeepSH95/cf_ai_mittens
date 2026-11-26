/**
 * Runs the attack suite for the attack page.
 *
 *   GET /api/attacks/mittens --> attackSandbox(real sandbox)   --> 8 cases, 0 breached
 *   GET /api/attacks/naive   --> attackSandbox(naive executor) --> 8 cases, the token leaks
 *
 * Both targets run every attack for real, in a Dynamic Worker. The canary is
 * the fake token of mittens_attack. No real token is involved.
 */
import { ATTACK_PROGRAMS, attackSandbox, CANARY_GITHUB_TOKEN, type AttackCase } from "mittens_attack";
import { createSandbox } from "mittens_sandbox";
import { createNaiveExecutor } from "../drivers/naive-executor";

export const AttackTarget = {
  // The real sandbox of this project.
  Mittens: "mittens",

  // The same isolate with the token in its env.
  Naive: "naive"
} as const;

export type AttackTarget = (typeof AttackTarget)[keyof typeof AttackTarget];

// Small limits keep the page fast: a runaway attack is stopped in about half a second.
const DEMO_LIMITS = { tickBudget: 10_000, timeoutMs: 500 };

/** One row of the page: the suite's verdict with the program that was run. */
export type AttackRow = AttackCase & { criterion: string; code: string };

export type AttackRun = { target: AttackTarget; breached: number; durationMs: number; cases: AttackRow[] };

export type AttackEnv = { LOADER: WorkerLoader };

/** Example: isAttackTarget("naive") is true, isAttackTarget("other") is false. */
export function isAttackTarget(value: string | undefined): value is AttackTarget {
  return value === AttackTarget.Mittens || value === AttackTarget.Naive;
}

/** Runs the eight attacks against one target. `gate` is the loopback gate handle. */
export async function runAttacks(env: AttackEnv, gate: Fetcher, target: AttackTarget): Promise<AttackRun> {
  const startedAt = Date.now();
  const report = await attackSandbox({ execute: executorFor(env, gate, target), canary: CANARY_GITHUB_TOKEN });

  return {
    target,
    breached: report.breached,
    durationMs: Date.now() - startedAt,
    cases: report.cases.map(withProgram)
  };
}

function executorFor(env: AttackEnv, gate: Fetcher, target: AttackTarget): (program: string) => Promise<unknown> {
  if (target === AttackTarget.Naive) {
    return createNaiveExecutor(env.LOADER, gate, CANARY_GITHUB_TOKEN, DEMO_LIMITS);
  }

  const sandbox = createSandbox({ loader: env.LOADER, gate, ...DEMO_LIMITS });

  return (program) => sandbox.execute(program);
}

function withProgram(attack: AttackCase): AttackRow {
  const program = ATTACK_PROGRAMS.find((candidate) => candidate.name === attack.name);

  return { ...attack, criterion: program?.criterion ?? "", code: program?.code ?? "" };
}
