/** The verifier's summary line for people and ledger/last-run.json for scripts. */

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

import type { ExitCode } from "./exit-codes.ts";

const LAST_RUN_PATH = "ledger/last-run.json";
const JSON_INDENT = 2;

export interface Outcome {
  readonly exitCode: ExitCode;
  readonly cases: number;
  readonly passed: number;
  readonly failed: number;
  readonly failing: string[];
  readonly uncovered: string[];
  readonly fence: string[];
  readonly goldSetErrors: string[];

  // The message of the exception that stopped the verifier, or null.
  readonly internalError: string | null;
}

const EMPTY_OUTCOME = {
  cases: 0,
  passed: 0,
  failed: 0,
  failing: [],
  uncovered: [],
  fence: [],
  goldSetErrors: [],
  internalError: null,
};

/** Builds an outcome from the exit code and the facts that are not empty. */
export function makeOutcome(exitCode: ExitCode, facts: Partial<Outcome> = {}): Outcome {
  return { ...EMPTY_OUTCOME, ...facts, exitCode };
}

/** Example: cases 34 pass 33 fail 1 uncovered 0 */
export function summaryLine(outcome: Outcome): string {
  return (
    `cases ${outcome.cases} pass ${outcome.passed} ` +
    `fail ${outcome.failed} uncovered ${outcome.uncovered.length}`
  );
}

/** Writes the same facts as the summary line, for the next loop pass. */
export function writeLastRun(root: string, outcome: Outcome): void {
  const lastRun = path.join(root, LAST_RUN_PATH);
  mkdirSync(path.dirname(lastRun), { recursive: true });

  // Keys are snake_case and sorted: shell scripts read this file, and a
  // stable order keeps its diffs small.
  const facts = {
    cases: outcome.cases,
    exit_code: outcome.exitCode,
    failed: outcome.failed,
    failing: outcome.failing,
    fence: outcome.fence,
    gold_set_errors: outcome.goldSetErrors,
    internal_error: outcome.internalError,
    passed: outcome.passed,
    uncovered: outcome.uncovered,
  };

  writeFileSync(lastRun, `${JSON.stringify(facts, null, JSON_INDENT)}\n`, "utf8");
}
