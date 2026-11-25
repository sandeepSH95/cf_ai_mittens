/**
 * Checks one gold case file against the shape in PLAN.md section 8.
 *
 * Usage: node verify/lint-case.ts [--signed] <case.json> [<case.json> ...]
 * Exit 0 when every file is well formed, 1 with the first error of each file.
 * --signed also requires the human's "verified" line, as in gold/cases/.
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { ExitCode } from "./exit-codes.ts";
import { CRITERIA_DIR, ID_PATTERN, Kind, isKind, readCriteria } from "./lint-criteria.ts";

const SIGNED_FLAG = "--signed";
const CASE_SUFFIX = ".json";

const CASE_ID = /^G-[0-9]{3}$/;
const CRITERION_ID = new RegExp(`^${ID_PATTERN}$`);

// Example: "by hand, 2026-11-22". Only a human writes this line.
const VERIFIED = /^by hand, [0-9]{4}-[0-9]{2}-[0-9]{2}$/;

const TOP_KEYS = ["id", "covers", "kind", "verified", "input", "expected", "runs"];
const APPROVALS = ["approve", "reject"];
const EXACT_TEXT_KEYS = ["user_message", "fixtures"];
const ADVERSARIAL_KEYS = ["error", "result"];

export const Stage = {
  // A draft in gold/drafts/: the "verified" line is optional.
  DRAFT: "draft",

  // A case in gold/cases/: a human has verified it and said so.
  SIGNED: "signed",
} as const;

export type Stage = (typeof Stage)[keyof typeof Stage];

type JsonObject = Record<string, unknown>;

// The first shape error of a case, or null when the case is valid.
type ShapeError = string | null;

/** A case that passed lintCase. Only these fields are safe to read. */
export interface GoldCase extends JsonObject {
  readonly id: string;
  readonly covers: string[];
  readonly kind: Kind;
  readonly input: JsonObject;
  readonly expected: unknown;
}

export interface CasesRead {
  readonly cases: GoldCase[];
  readonly errors: string[];
}

/** Returns the first shape error of one case, or null when it is valid. */
export function lintCase(candidate: unknown, stage: Stage): ShapeError {
  if (!isObject(candidate)) {
    return "case is not a JSON object";
  }

  const unknownKeys = Object.keys(candidate)
    .filter((key) => !TOP_KEYS.includes(key))
    .sort();

  if (unknownKeys.length > 0) {
    return `unknown key '${unknownKeys[0]}'`;
  }

  if (!isText(candidate.id) || !CASE_ID.test(candidate.id)) {
    return "id must look like G-012";
  }

  const covers = candidate.covers;

  if (!Array.isArray(covers) || covers.length === 0) {
    return "covers must be a non-empty list";
  }

  for (const covered of covers) {
    if (!isText(covered) || !CRITERION_ID.test(covered)) {
      return `covers entry ${show(covered)} is not a criterion ID`;
    }
  }

  const kind = candidate.kind;

  if (!isKind(kind)) {
    return `kind ${show(kind)} is not known`;
  }

  const verifiedError = lintVerified(candidate, stage);

  if (verifiedError) {
    return verifiedError;
  }

  if (!isObject(candidate.input)) {
    return "input must be an object";
  }

  if (!("expected" in candidate)) {
    return "expected is missing";
  }

  return KIND_RULES[kind](candidate, candidate.input);
}

/** Lists the covered IDs that no criteria file defines. */
export function unknownCovers(goldCase: GoldCase, knownIds: ReadonlySet<string>): string[] {
  return goldCase.covers.filter((covered) => !knownIds.has(covered));
}

/** Reads every *.json under goldDir. Returns the valid cases and the errors. */
export function loadCases(goldDir: string, stage: Stage): CasesRead {
  const cases: GoldCase[] = [];
  const errors: string[] = [];
  const seenIds = new Set<string>();

  if (!existsSync(goldDir) || !statSync(goldDir).isDirectory()) {
    return { cases, errors };
  }

  const fileNames = readdirSync(goldDir)
    .filter((name) => name.endsWith(CASE_SUFFIX))
    .sort();

  for (const fileName of fileNames) {
    const read = readCase(path.join(goldDir, fileName), stage);

    if (typeof read === "string") {
      errors.push(`${fileName}: ${read}`);
      continue;
    }

    if (seenIds.has(read.id)) {
      errors.push(`${fileName}: id ${read.id} is used by another case`);
      continue;
    }

    seenIds.add(read.id);
    cases.push(read);
  }

  return { cases, errors };
}

/** Returns the valid case, or the error line that explains why it is not. */
function readCase(filePath: string, stage: Stage): GoldCase | string {
  let candidate: unknown;

  try {
    candidate = JSON.parse(readFileSync(filePath, "utf8"));
  } catch (failure) {
    return `cannot read JSON: ${failure instanceof Error ? failure.message : String(failure)}`;
  }

  // lintCase is the only gate: a candidate with no error has the GoldCase shape.
  return lintCase(candidate, stage) ?? (candidate as GoldCase);
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === "string" && value !== "";
}

/** Prints a value inside an error line. Example: 'sbx-1', 42, null. */
function show(value: unknown): string {
  return typeof value === "string" ? `'${value}'` : String(JSON.stringify(value));
}

function lintVerified(candidate: JsonObject, stage: Stage): ShapeError {
  if (!("verified" in candidate)) {
    return stage === Stage.SIGNED ? "verified is missing" : null;
  }

  if (!isText(candidate.verified) || !VERIFIED.test(candidate.verified)) {
    return "verified must look like 'by hand, 2026-11-22'";
  }

  return null;
}

/** Exact: a user message, a fixture, a scripted model, an approval answer. */
function lintExact(candidate: JsonObject, input: JsonObject): ShapeError {
  for (const key of EXACT_TEXT_KEYS) {
    if (!isText(input[key])) {
      return `input.${key} must be a non-empty string`;
    }
  }

  const script = input.model_script;

  if (!Array.isArray(script) || script.length === 0) {
    return "input.model_script must be a non-empty list";
  }

  for (const [position, step] of script.entries()) {
    const stepError = lintStep(step);

    if (stepError) {
      return `input.model_script[${position}] ${stepError}`;
    }
  }

  if ("approval" in input && !APPROVALS.includes(input.approval as string)) {
    return "input.approval must be approve or reject";
  }

  if (!isObject(candidate.expected)) {
    return "expected must be an object";
  }

  return null;
}

/** A step is a tool call, {"tool": ..., "program"?: ...}, or {"text": ...}. */
function lintStep(step: unknown): ShapeError {
  if (!isObject(step)) {
    return "must be an object";
  }

  if (isText(step.text) && Object.keys(step).length === 1) {
    return null;
  }

  if (!isText(step.tool)) {
    return "needs 'tool' or 'text'";
  }

  if ("program" in step && !isText(step.program)) {
    return "program must be a non-empty string";
  }

  return null;
}

/** Adversarial: a malicious program and its exact error and result. */
function lintAdversarial(candidate: JsonObject, input: JsonObject): ShapeError {
  if (!isText(input.program)) {
    return "input.program must be a non-empty string";
  }

  if ("options" in input && !isObject(input.options)) {
    return "input.options must be an object";
  }

  const expected = candidate.expected;

  if (!isObject(expected) || !hasExactKeys(expected, ADVERSARIAL_KEYS)) {
    return "expected must hold exactly 'error' and 'result'";
  }

  return null;
}

function hasExactKeys(value: JsonObject, keys: string[]): boolean {
  const actual = Object.keys(value);

  return actual.length === keys.length && keys.every((key) => actual.includes(key));
}

/** Contract: one call on a public API and its exact answer. */
function lintContract(_candidate: JsonObject, input: JsonObject): ShapeError {
  if (!isText(input.call)) {
    return "input.call must be a non-empty string";
  }

  return null;
}

/** Invariant: N live-model runs and the predicate names each must hold. */
function lintInvariant(candidate: JsonObject): ShapeError {
  const runs = candidate.runs;

  if (!Number.isInteger(runs) || (runs as number) < 1) {
    return "runs must be a positive integer";
  }

  const expected = candidate.expected;

  if (!Array.isArray(expected) || expected.length === 0 || !expected.every(isText)) {
    return "expected must be a non-empty list of predicate names";
  }

  return null;
}

const KIND_RULES: Record<Kind, (candidate: JsonObject, input: JsonObject) => ShapeError> = {
  [Kind.EXACT]: lintExact,
  [Kind.ADVERSARIAL]: lintAdversarial,
  [Kind.CONTRACT]: lintContract,
  [Kind.INVARIANT]: lintInvariant,
};

function lintFile(filePath: string, stage: Stage, knownIds: ReadonlySet<string>): ShapeError {
  const read = readCase(filePath, stage);

  if (typeof read === "string") {
    return read;
  }

  const unknown = unknownCovers(read, knownIds);

  if (unknown.length > 0) {
    return `covers ${unknown.join(", ")}, not in criteria/`;
  }

  return null;
}

function main(args: string[]): ExitCode {
  const stage = args.includes(SIGNED_FLAG) ? Stage.SIGNED : Stage.DRAFT;
  const filePaths = args.filter((argument) => argument !== SIGNED_FLAG);

  if (filePaths.length === 0) {
    console.log(`usage: node verify/lint-case.ts [${SIGNED_FLAG}] <case.json> ...`);
    return ExitCode.RED;
  }

  const { criteria } = readCriteria(CRITERIA_DIR);
  const knownIds = new Set(criteria.map((criterion) => criterion.id));
  let exitCode: ExitCode = ExitCode.GREEN;

  for (const filePath of filePaths) {
    const error = lintFile(filePath, stage, knownIds);

    if (!error) {
      continue;
    }

    console.log(`${filePath}: ${error}`);
    exitCode = ExitCode.RED;
  }

  return exitCode;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
