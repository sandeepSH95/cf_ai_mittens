/**
 * The adapter: the one place where a gold case meets the code under test.
 *
 *   gold case (input) --> runCase() --> packages by name --> actual value (JSON)
 *
 * What each kind must return, so the comparison in cases.test.ts is exact:
 *   adversarial  { error, result } from mittens_sandbox executing input.program
 *                with input.options, against the fixture-backed gate.
 *   contract     the JSON value of the registry call named by input.call
 *                (for example "attack.names"), with input.args.
 *   exact        an object with the keys PLAN.md section 8 lists:
 *                program_result, plan, ledger, apply_outcome, stub_writes,
 *                refusal, model_received, driver_calls. The runner compares
 *                only the keys the case's expected value holds.
 *
 * The packages do not exist yet (PLAN.md S6), so every case fails here with
 * NOT_BUILT. This file is inside the fence: the builder never edits it.
 */

import type { Json, JsonObject } from "../normalise.ts";

export const NOT_BUILT =
  "adapter: the packages are not built yet (PLAN.md S6), so this case cannot run";

/** A gold case as the runner hands it over. Shape checked by lint-case.ts. */
export interface RunnableCase {
  readonly id: string;
  readonly kind: string;
  readonly covers: string[];
  readonly input: JsonObject;
  readonly expected: Json;
}

/** Path relative to the repository root -> file text. Example: "fixtures/repo-small.json". */
export type CaseFiles = Record<string, string>;

/** Runs one case against the real packages and returns the actual value. */
export async function runCase(_goldCase: RunnableCase, _files: CaseFiles): Promise<Json> {
  throw new Error(NOT_BUILT);
}
