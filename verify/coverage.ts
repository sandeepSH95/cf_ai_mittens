/**
 * Checks that every MUST criterion has a gold case that can block the loop.
 *
 *     criteria (MUST ids) ----+
 *                             +--> findUncovered() --> ["SBX-004", "GATE-002"]
 *     gold cases (covers) ----+
 *
 * An invariant case reports and never blocks, so it does not cover a MUST.
 * A case of another kind than the criterion's proved-by kind does not cover it.
 *
 * Usage: node verify/coverage.ts        (GOLD_DIR overrides gold/cases)
 * Exit 0 when every MUST is covered, 4 with "uncovered: ..." otherwise.
 */

import path from "node:path";

import { ExitCode } from "./exit-codes.ts";
import { Stage, loadCases } from "./lint-case.ts";
import type { GoldCase } from "./lint-case.ts";
import { CRITERIA_DIR, Kind, Level, ROOT, readCriteria } from "./lint-criteria.ts";
import type { Criterion } from "./lint-criteria.ts";

const GOLD_DIR_VARIABLE = "GOLD_DIR";
const DEFAULT_GOLD_DIR = "gold/cases";

const BLOCKING_KINDS: readonly Kind[] = [Kind.EXACT, Kind.ADVERSARIAL, Kind.CONTRACT];

/** The held-out run points GOLD_DIR at a folder outside the repository. */
export function goldDir(root: string): string {
  return path.resolve(root, process.env[GOLD_DIR_VARIABLE] ?? DEFAULT_GOLD_DIR);
}

/**
 * Returns the MUST ids with no blocking case, in criteria order.
 *
 * A case covers a criterion only when it is of the criterion's own proved-by
 * kind. Example: SBX-001 is "adversarial: ...", so a contract case that lists
 * SBX-001 does not cover it. One cheap case cannot claim every criterion.
 */
export function findUncovered(criteria: Criterion[], cases: GoldCase[]): string[] {
  return criteria
    .filter((criterion) => criterion.level === Level.MUST && !isCovered(criterion, cases))
    .map((criterion) => criterion.id);
}

function isCovered(criterion: Criterion, cases: GoldCase[]): boolean {
  if (!BLOCKING_KINDS.includes(criterion.kind)) {
    return false;
  }

  return cases.some(
    (goldCase) => goldCase.kind === criterion.kind && goldCase.covers.includes(criterion.id),
  );
}

function main(): ExitCode {
  const criteriaRead = readCriteria(CRITERIA_DIR);
  const casesRead = loadCases(goldDir(ROOT), Stage.SIGNED);
  const errors = [...criteriaRead.errors, ...casesRead.errors];

  for (const error of errors) {
    console.log(`gold set: ${error}`);
  }

  const uncovered = findUncovered(criteriaRead.criteria, casesRead.cases);

  if (uncovered.length > 0) {
    console.log(`uncovered: ${uncovered.join(", ")}`);
  }

  if (uncovered.length > 0 || errors.length > 0) {
    return ExitCode.UNCOVERED;
  }

  console.log(`covered: every MUST criterion, by ${casesRead.cases.length} cases`);
  return ExitCode.GREEN;
}

if (import.meta.main) {
  process.exitCode = main();
}
