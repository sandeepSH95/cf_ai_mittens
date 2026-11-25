/**
 * The verifier. One run, in order, stopping at the first failure:
 *
 *     any crash -----> exit 5   the verifier failed, not the build
 *
 *     manifest ------> exit 3   fence broken, nothing below can be trusted
 *         |
 *     gold set ------> exit 4   criteria or cases malformed, a human owns them
 *         |
 *     coverage ------> exit 4   a MUST criterion has no blocking case
 *         |
 *     case runner ---> exit 1   a case failed, or no runner exists yet
 *         |
 *     report           exit 0   summary line and ledger/last-run.json
 *
 * The case runner executes each gold case inside workerd. It does not exist
 * yet (PLAN.md S3 item 6), so a run cannot be green.
 *
 * Usage: sh verify/run.sh        (GOLD_DIR overrides gold/cases)
 */

import path from "node:path";

import { findUncovered, goldDir } from "./coverage.ts";
import { ExitCode } from "./exit-codes.ts";
import { Stage, loadCases, unknownCovers } from "./lint-case.ts";
import type { GoldCase } from "./lint-case.ts";
import { ROOT, readCriteria } from "./lint-criteria.ts";
import type { Criterion } from "./lint-criteria.ts";
import { checkManifest } from "./manifest.ts";
import { makeOutcome, summaryLine, writeLastRun } from "./report.ts";
import type { Outcome } from "./report.ts";

const CRITERIA_PATH = "criteria";

/** Runs the host-side checks and returns what the report needs. */
export function verify(root: string, casesDir: string): Outcome {
  // Step 1, the fence. A broken fence stops the run before any other check.
  // The fence includes the folder the cases come from, so unsigned cases never run.
  const broken = checkManifest(root, casesDir);

  for (const entry of broken) {
    console.log(`fence broken: ${entry}`);
  }

  if (broken.length > 0) {
    return makeOutcome(ExitCode.FENCE_BROKEN, { fence: broken });
  }

  // Step 2, the gold set itself. The builder cannot fix these files, so a
  // malformed one stops with the code that hands the run to the human.
  const criteriaRead = readCriteria(path.join(root, CRITERIA_PATH));
  const casesRead = loadCases(casesDir, Stage.SIGNED);
  const { criteria } = criteriaRead;
  const { cases } = casesRead;
  const errors = [...criteriaRead.errors, ...casesRead.errors, ...unknownErrors(criteria, cases)];

  for (const error of errors) {
    console.log(`gold set: ${error}`);
  }

  if (errors.length > 0) {
    return makeOutcome(ExitCode.UNCOVERED, { cases: cases.length, goldSetErrors: errors });
  }

  // Step 3, coverage. A MUST without a case is a MUST the loop cannot enforce.
  const uncovered = findUncovered(criteria, cases);

  if (uncovered.length > 0) {
    console.log(`uncovered: ${uncovered.join(", ")}`);
    return makeOutcome(ExitCode.UNCOVERED, { cases: cases.length, uncovered });
  }

  // Step 4, the cases. Not built yet: red, never green, until they can run.
  console.log("runner: not built (PLAN.md S3 item 6). No case was run.");
  return makeOutcome(ExitCode.RED, { cases: cases.length });
}

function unknownErrors(criteria: Criterion[], cases: GoldCase[]): string[] {
  const knownIds = new Set(criteria.map((criterion) => criterion.id));

  return cases.flatMap((goldCase) =>
    unknownCovers(goldCase, knownIds).map(
      (covered) => `${goldCase.id}: covers ${covered}, not in criteria/`,
    ),
  );
}

/**
 * One full run: the checks, the summary line and ledger/last-run.json.
 * A crash of the verifier becomes exit 5 and is written to last-run.json, so
 * the next loop pass never reads the facts of an older run as current.
 */
export function run(root: string, casesDir: string): Outcome {
  const outcome = verifySafely(root, casesDir);

  console.log(summaryLine(outcome));
  writeLastRun(root, outcome);

  return outcome;
}

function verifySafely(root: string, casesDir: string): Outcome {
  try {
    return verify(root, casesDir);
  } catch (failure) {
    const internalError = failure instanceof Error ? failure.message : String(failure);

    console.log(`verifier error: ${internalError}`);
    return makeOutcome(ExitCode.VERIFIER_ERROR, { internalError });
  }
}

if (import.meta.main) {
  // Set first: if writing the report throws as well, the exit code is still 5.
  process.exitCode = ExitCode.VERIFIER_ERROR;
  process.exitCode = run(ROOT, goldDir(ROOT)).exitCode;
}
