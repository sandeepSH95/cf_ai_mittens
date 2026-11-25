/**
 * Runs the attack programs against any executor.
 *
 *   attackSandbox(executorFor)
 *        |  for each attack: executorFor(attack.limits)  -> { run(code) }
 *        v
 *   executor.run(attack.code)  -> { result, error }
 *        |
 *        v
 *   AttackOutcome { name, criterion, result, error, durationMs }
 *
 * This package runs the programs and reports what came back. The caller
 * asserts on the outcomes, because the expected values belong to the
 * executor under test (its error messages, its binding names).
 */
import { ATTACK_NAMES, ATTACK_PROGRAMS, type AttackCriterion, type AttackLimits, type AttackName } from "./programs";

/** What an executor must return for one program. Never throws: a failure is in `error`. */
export type AttackRun = { result: unknown; error: string | null };

/** The executor contract. Example: mittens_sandbox's SandboxExecutor. */
export type AttackExecutor = { run(code: string): Promise<AttackRun> };

/** Builds an executor with the limits one attack asks for. */
export type ExecutorFactory = (limits: AttackLimits) => AttackExecutor;

export type AttackOutcome = {
  name: AttackName;
  criterion: AttackCriterion;
  result: unknown;
  error: string | null;
  /** Milliseconds the executor took for this program, measured by the caller side. */
  durationMs: number;
};

/** Runs one attack program and returns what the executor reported. */
export async function runAttack(executorFor: ExecutorFactory, name: AttackName): Promise<AttackOutcome> {
  const attack = ATTACK_PROGRAMS[name];
  const startedAt = Date.now();
  const run = await executorFor(attack.limits).run(attack.code);

  return { name, criterion: attack.criterion, result: run.result, error: run.error, durationMs: Date.now() - startedAt };
}

/** Runs the named attacks in order (default: all of them), one fresh executor per attack. */
export async function attackSandbox(executorFor: ExecutorFactory, names: readonly AttackName[] = ATTACK_NAMES): Promise<AttackOutcome[]> {
  const outcomes: AttackOutcome[] = [];

  for (const name of names) {
    outcomes.push(await runAttack(executorFor, name));
  }

  return outcomes;
}
