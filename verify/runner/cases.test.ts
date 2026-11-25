/**
 * The case runner. Runs inside workerd through vitest; one test per gold case.
 *
 *   inject("goldCases") --> for each case: adapter.runCase --> normalise --> compare
 *
 * A failing case throws an Error whose message is the diff of the normalised
 * expected and actual values, or the one "contract:" line of the adapter.
 * The error carries no stack: the report holds the message and nothing else.
 * spawn.ts reads the JSON report of this run.
 */

import { inject, test } from "vitest";

import { canonical, diffLines, isObject, normaliseExact } from "../normalise.ts";
import type { Json, JsonObject } from "../normalise.ts";
import { runCase } from "./adapter.ts";
import type { CaseFiles, RunnableCase } from "./adapter.ts";
import type { HarnessFacts } from "./registry.ts";

const KIND_EXACT = "exact";
const KIND_INVARIANT = "invariant";

declare module "vitest" {
  interface ProvidedContext {
    goldCases: RunnableCase[];
    goldFiles: CaseFiles;
    harnessFacts: HarnessFacts;
  }
}

const goldCases = inject("goldCases");
const goldFiles = inject("goldFiles");
const harnessFacts = inject("harnessFacts");

for (const goldCase of goldCases) {
  // An invariant case needs a live model and never blocks, so it is skipped here.
  if (goldCase.kind === KIND_INVARIANT) {
    test.skip(goldCase.id, () => {});
    continue;
  }

  test(goldCase.id, async () => {
    const failure = await judge(goldCase);

    if (failure !== null) {
      throw withoutStack(failure);
    }
  });
}

/** Returns the failure text of one case, or null when it passes. */
async function judge(goldCase: RunnableCase): Promise<string | null> {
  let actual: Json;

  try {
    actual = await runCase(goldCase, goldFiles, harnessFacts);
  } catch (failure) {
    // The adapter throws only its own one-line contract errors.
    return failure instanceof Error ? failure.message : String(failure);
  }

  const difference = compare(goldCase, actual);

  return difference.length > 0 ? difference.join("\n") : null;
}

/** The stack names files of the verifier, which says nothing about the build. */
function withoutStack(message: string): Error {
  const failure = new Error(message);
  failure.stack = message;

  return failure;
}

/** Returns the diff lines, or an empty list when the case passes. */
function compare(goldCase: RunnableCase, actual: Json): string[] {
  let expected = goldCase.expected;
  let observed = actual;

  if (goldCase.kind === KIND_EXACT) {
    // An exact case tests only the keys its expected value holds.
    observed = project(observed, expected);
    ({ expected, actual: observed } = normaliseExact(expected, observed));
  }

  const expectedText = canonical(expected);
  const actualText = canonical(observed);

  if (expectedText === actualText) {
    return [];
  }

  return diffLines(expectedText, actualText);
}

/** Keeps the top-level keys of actual that expected also holds. */
function project(actual: Json, expected: Json): Json {
  if (!isObject(actual) || !isObject(expected)) {
    return actual;
  }

  const kept: JsonObject = {};

  for (const key of Object.keys(expected)) {
    if (key in actual) {
      kept[key] = actual[key] as Json;
    }
  }

  return kept;
}
