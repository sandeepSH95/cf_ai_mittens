/**
 * Reads criteria/*.md and checks the rules of PLAN.md S2 and section 7.
 *
 *     criteria/sandbox.md --+
 *     criteria/gate.md    --+--> readCriteria() --> { criteria, errors }
 *     ...                 --+
 *
 * Usage: node verify/lint-criteria.ts
 * Exit 0 when the files are well formed, 1 with one line per error otherwise.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { ExitCode } from "./exit-codes.ts";

export const ROOT = path.resolve(import.meta.dirname, "..");
export const CRITERIA_DIR = path.join(ROOT, "criteria");

// One prefix per file, PLAN.md section 7. Example: sandbox.md holds SBX-001.
export const FILE_PREFIX: Readonly<Record<string, string>> = {
  "sandbox.md": "SBX",
  "gate.md": "GATE",
  "attack.md": "ATK",
  "demo.md": "APP",
  "harness.md": "HARN",
};

// The count limits come from the "Done when" line of PLAN.md S2.
const MIN_CRITERIA = 15;
const MAX_CRITERIA = 25;

// Every requirement of the prototype must be carried forward: KCM-001..KCM-010.
const OLD_PREFIX = "KCM";
const OLD_ID_COUNT = 10;
const ID_DIGITS = 3;

export const ID_PATTERN = "[A-Z]{3,4}-[0-9]{3}";
const ANY_ID = new RegExp(ID_PATTERN, "g");
const ROW_START = new RegExp(`^\\| ${ID_PATTERN} `);

// Example: | SBX-002 | MUST | The isolate's ... | adversarial: a program ... |
const ROW = new RegExp(
  `^\\| (?<id>${ID_PATTERN}) \\| (?<level>\\S+) \\| (?<requirement>.+)` +
    ` \\| (?<kind>[a-z]+): (?<sketch>.+) \\|$`,
);

export const Level = {
  MUST: "MUST",
  SHOULD: "SHOULD",
} as const;

export type Level = (typeof Level)[keyof typeof Level];

export const Kind = {
  EXACT: "exact",
  ADVERSARIAL: "adversarial",
  CONTRACT: "contract",
  INVARIANT: "invariant",
} as const;

export type Kind = (typeof Kind)[keyof typeof Kind];

export interface Criterion {
  readonly id: string;
  readonly level: Level;
  readonly kind: Kind;
  readonly file: string;
}

export interface CriteriaRead {
  readonly criteria: Criterion[];
  readonly errors: string[];
}

// A row is either a criterion or one error line.
type RowError = string;

export function isKind(value: unknown): value is Kind {
  return Object.values(Kind).includes(value as Kind);
}

function isLevel(value: unknown): value is Level {
  return Object.values(Level).includes(value as Level);
}

/** Returns every well-formed criterion and every error found. */
export function readCriteria(criteriaDir: string): CriteriaRead {
  const criteria: Criterion[] = [];
  const errors: string[] = [];
  const citedIds: string[] = [];
  const failedIds: string[] = [];

  for (const [fileName, prefix] of Object.entries(FILE_PREFIX)) {
    const filePath = path.join(criteriaDir, fileName);

    if (!existsSync(filePath)) {
      errors.push(`${fileName}: file is missing`);
      continue;
    }

    const text = readFileSync(filePath, "utf8");
    citedIds.push(...(text.match(ANY_ID) ?? []));

    for (const line of text.split(/\r?\n/)) {
      if (!ROW_START.test(line)) {
        continue;
      }

      const parsed = parseRow(line, fileName, prefix);

      if (typeof parsed === "string") {
        errors.push(parsed);
        failedIds.push(rowIdOf(line));
        continue;
      }

      criteria.push(parsed);
    }
  }

  const rowIds = [...criteria.map((criterion) => criterion.id), ...failedIds];

  errors.push(...orphanErrors(citedIds, rowIds));
  errors.push(...repeatErrors(citedIds));
  errors.push(...countErrors(criteria.length));
  errors.push(...carryErrors(citedIds));

  return { criteria, errors };
}

/** Turns one table row into a Criterion, or into one error line. */
function parseRow(line: string, fileName: string, prefix: string): Criterion | RowError {
  const rowId = rowIdOf(line);
  const groups = ROW.exec(line)?.groups;

  if (!groups) {
    return `${rowId}: row is not '| ID | Level | Requirement | kind: sketch |'`;
  }

  const { level, kind, requirement = "" } = groups;

  if (!isLevel(level)) {
    return `${rowId}: level '${level}' is not MUST or SHOULD`;
  }

  if (!isKind(kind)) {
    return `${rowId}: proved-by kind '${kind}' is not known`;
  }

  if (!rowId.startsWith(`${prefix}-`)) {
    return `${rowId}: wrong prefix for ${fileName}, expected ${prefix}`;
  }

  // RFC 2119 wording: the sentence must use the word its level names.
  if (!requirement.includes(level)) {
    return `${rowId}: requirement does not contain the word ${level}`;
  }

  // Section 7: a criterion no deterministic case can prove is a SHOULD.
  if (kind === Kind.INVARIANT && level === Level.MUST) {
    return `${rowId}: an invariant cannot prove a MUST`;
  }

  return { id: rowId, level, kind, file: fileName };
}

/** Example: "| SBX-002 | MUST | ..." gives "SBX-002". */
function rowIdOf(line: string): string {
  return line.split(" ")[1] ?? "";
}

/**
 * Every new ID in a file must come from a row that was read as a row.
 * Example: "|  SBX-001 | MUST ..." has two spaces, so it is not read as a
 * row. Without this rule that MUST would leave coverage with no error.
 */
function orphanErrors(citedIds: string[], rowIds: string[]): string[] {
  const orphans = citedIds.filter(
    (cited) => !cited.startsWith(`${OLD_PREFIX}-`) && !rowIds.includes(cited),
  );

  return [...new Set(orphans)].sort().map((orphan) => `${orphan}: is cited but has no valid row`);
}

/** Same rule as the `sort | uniq -d` check of S2: no ID appears twice. */
function repeatErrors(citedIds: string[]): string[] {
  const counts = new Map<string, number>();

  for (const cited of citedIds) {
    counts.set(cited, (counts.get(cited) ?? 0) + 1);
  }

  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .sort(([left], [right]) => (left < right ? -1 : 1))
    .map(([cited, count]) => `${cited}: appears ${count} times`);
}

function countErrors(count: number): string[] {
  if (count >= MIN_CRITERIA && count <= MAX_CRITERIA) {
    return [];
  }

  return [`${count} criteria, expected ${MIN_CRITERIA} to ${MAX_CRITERIA}`];
}

/** Every old ID, KCM-001 to KCM-010, must be cited by a new criterion. */
function carryErrors(citedIds: string[]): string[] {
  const errors: string[] = [];

  for (let number = 1; number <= OLD_ID_COUNT; number += 1) {
    const oldId = `${OLD_PREFIX}-${String(number).padStart(ID_DIGITS, "0")}`;

    if (!citedIds.includes(oldId)) {
      errors.push(`${oldId}: not carried forward`);
    }
  }

  return errors;
}

function main(): ExitCode {
  const { criteria, errors } = readCriteria(CRITERIA_DIR);

  for (const error of errors) {
    console.log(`criteria: ${error}`);
  }

  if (errors.length > 0) {
    return ExitCode.RED;
  }

  console.log(`criteria ok: ${criteria.length} rows`);
  return ExitCode.GREEN;
}

if (import.meta.main) {
  process.exitCode = main();
}
