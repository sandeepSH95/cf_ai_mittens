/**
 * Normalisation before the byte-for-byte comparison (PLAN.md section 8).
 *
 *   expected ---+                          +--- canonical JSON ---+
 *               |-- normalise(kind) ---->  |                      |-- same text?  PASS
 *   actual -----+                          +--- canonical JSON ---+     else      diff lines
 *
 * The rules, applied to the expected and the actual side alike:
 *   1. `ledger.isolate_start_ms` and `ledger.duration_ms`: the expected side is
 *      a `{ min, max }` range. An actual number inside the range becomes that
 *      range, so both sides print the same text. A number outside the range
 *      stays a number and the diff shows it.
 *   2. `ledger.created_at` and `ledger.id` become the placeholders "<ts>" and
 *      "<id>": the clock and the row counter are not under test.
 *   3. Object keys are sorted at every depth, so key order never fails a case.
 *   4. `ledger.result_json` is truncated the way the ledger truncates it.
 *   5. Whitespace inside strings is kept. Nothing else is touched.
 *
 * This file has no Node imports: the case runner loads it inside workerd.
 */

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
export type JsonObject = { [key: string]: Json };

export const LEDGER_KEY = "ledger";
export const RANGE_KEYS: readonly string[] = ["isolate_start_ms", "duration_ms"];
export const TIMESTAMP_KEY = "created_at";
export const ROW_ID_KEY = "id";
export const RESULT_JSON_KEY = "result_json";

export const TIMESTAMP_PLACEHOLDER = "<ts>";
export const ROW_ID_PLACEHOLDER = "<id>";

/** The ledger keeps this many characters of a result and appends "...". */
export const MAX_RESULT_CHARS = 4000;
const TRUNCATION_MARK = "...";

export const DIFF_MAX_LINES = 60;
const JSON_INDENT = 2;
const REMOVED = "- ";
const ADDED = "+ ";
const SAME = "  ";

export interface Range {
  readonly min: number;
  readonly max: number;
}

export interface Normalised {
  readonly expected: Json;
  readonly actual: Json;
}

/**
 * Applies the ledger rules to an exact case's expected and actual values.
 * Other kinds need only the canonical form, which `canonical` gives them.
 */
export function normaliseExact(expected: Json, actual: Json): Normalised {
  if (!isObject(expected) || !isObject(actual)) {
    return { expected, actual };
  }

  const expectedLedger = expected[LEDGER_KEY];
  const actualLedger = actual[LEDGER_KEY];

  if (!isObject(expectedLedger) || !isObject(actualLedger)) {
    return { expected, actual };
  }

  return {
    expected: { ...expected, [LEDGER_KEY]: normaliseLedger(expectedLedger, expectedLedger) },
    actual: { ...actual, [LEDGER_KEY]: normaliseLedger(actualLedger, expectedLedger) },
  };
}

/** Rules 1, 2 and 4 on one ledger object. The expected ledger supplies the ranges. */
function normaliseLedger(ledger: JsonObject, expectedLedger: JsonObject): JsonObject {
  const out: JsonObject = { ...ledger };

  for (const key of RANGE_KEYS) {
    const range = expectedLedger[key];
    const value = out[key];

    if (isRange(range) && typeof value === "number" && inRange(value, range)) {
      out[key] = { min: range.min, max: range.max };
    }
  }

  if (TIMESTAMP_KEY in out) {
    out[TIMESTAMP_KEY] = TIMESTAMP_PLACEHOLDER;
  }

  if (ROW_ID_KEY in out) {
    out[ROW_ID_KEY] = ROW_ID_PLACEHOLDER;
  }

  const resultJson = out[RESULT_JSON_KEY];

  if (typeof resultJson === "string") {
    out[RESULT_JSON_KEY] = truncate(resultJson);
  }

  return out;
}

/** The ledger's own truncation, so a long result compares the way it is stored. */
export function truncate(text: string): string {
  if (text.length <= MAX_RESULT_CHARS) {
    return text;
  }

  return `${text.slice(0, MAX_RESULT_CHARS)}${TRUNCATION_MARK}`;
}

export function isRange(value: unknown): value is Range {
  if (!isObject(value)) {
    return false;
  }

  const keys = Object.keys(value).sort().join(",");
  return keys === "max,min" && typeof value.min === "number" && typeof value.max === "number";
}

function inRange(value: number, range: Range): boolean {
  return value >= range.min && value <= range.max;
}

/** Rule 3: JSON text with keys sorted at every depth, two-space indent. */
export function canonical(value: Json): string {
  return JSON.stringify(sortKeys(value), null, JSON_INDENT);
}

export function sortKeys(value: Json): Json {
  if (Array.isArray(value)) {
    return value.map(sortKeys);
  }

  if (!isObject(value)) {
    return value;
  }

  const sorted: JsonObject = {};

  for (const key of Object.keys(value).sort()) {
    sorted[key] = sortKeys(value[key] as Json);
  }

  return sorted;
}

export function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A line diff of two texts, "- " for expected-only lines and "+ " for
 * actual-only lines, capped at DIFF_MAX_LINES so a failing case never floods
 * the report. Longest common subsequence over lines; the texts are small.
 */
export function diffLines(
  expectedText: string,
  actualText: string,
  maxLines: number = DIFF_MAX_LINES,
): string[] {
  const left = expectedText.split("\n");
  const right = actualText.split("\n");
  const table = lcsTable(left, right);
  const lines: string[] = [];
  let i = 0;
  let j = 0;

  while (i < left.length || j < right.length) {
    if (i < left.length && j < right.length && left[i] === right[j]) {
      lines.push(SAME + left[i]);
      i += 1;
      j += 1;
      continue;
    }

    // On a tie the expected line comes first, so a changed line reads "- old" then "+ new".
    const takeRight = i >= left.length || tableAt(table, i, j + 1) > tableAt(table, i + 1, j);

    if (j < right.length && takeRight) {
      lines.push(ADDED + right[j]);
      j += 1;
      continue;
    }

    lines.push(REMOVED + left[i]);
    i += 1;
  }

  return capped(lines, maxLines);
}

/** table[i][j] is the common subsequence length of left[i..] and right[j..]. */
function lcsTable(left: string[], right: string[]): number[][] {
  const table: number[][] = [];

  for (let i = left.length; i >= 0; i -= 1) {
    const below = table[0] ?? [];
    const row: number[] = new Array<number>(right.length + 1).fill(0);

    for (let j = right.length - 1; j >= 0 && i < left.length; j -= 1) {
      row[j] =
        left[i] === right[j]
          ? (below[j + 1] ?? 0) + 1
          : Math.max(below[j] ?? 0, row[j + 1] ?? 0);
    }

    table.unshift(row);
  }

  return table;
}

function tableAt(table: number[][], i: number, j: number): number {
  return table[i]?.[j] ?? 0;
}

function capped(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }

  const hidden = lines.length - maxLines;
  return [...lines.slice(0, maxLines), `${SAME}... ${hidden} more lines`];
}
