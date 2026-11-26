/**
 * The executors the adapter runs programs with.
 *
 *   sandboxExecutor(options)  the real one: mittens_sandbox over the demo's gate
 *        createSandbox({ loader, gate, ...options }).execute(program)
 *
 *   inertExecutor()           runs nothing, returns an empty outcome.
 *                             Used to read the shape of an attack report.
 *
 *   leakyExecutor(canary)     runs nothing. A program that lists the keys of
 *                             env gets an env that holds the canary:
 *
 *        "Object.keys(env)" in the program?  --yes-->  result { env: { GITHUB_TOKEN: canary } }
 *                                            --no--->  the empty outcome
 *
 *   escapedExecutor()         runs nothing. Every program "succeeds":
 *                             result { escaped: true }, no error.
 *
 *   leakyBase64Executor(canary)  as leakyExecutor, but the canary is in base64,
 *                             as a program that hides the token would send it.
 *
 * The fixture executors never run a program on purpose: a runaway loop
 * with no tick budget blocks local workerd (PLAN.md section 11).
 */

import type { JsonObject } from "../normalise.ts";
import {
  Exports,
  expectObject,
  fail,
  guarded,
  loadExport,
  loaderBinding,
} from "./packages.ts";

const EXECUTE_KEY = "execute";
const OUTCOME_KEYS: readonly string[] = ["result", "error", "facadeCalls", "isolateStartMs"];
const OUTCOME_SHAPE = "execute(program) must resolve to { result, error, facadeCalls, isolateStartMs }";
const SANDBOX_SHAPE = "createSandbox(options) must return { execute(program) }";

// A program that lists the keys, the values or the entries of env.
const LISTS_ENV = /Object\s*\.\s*(keys|values|entries)\s*\(\s*env\b/;
const LEAKED_BINDING = "GITHUB_TOKEN";
const GATE_BINDING = "GH";

// What a program of the suite returns when its forbidden action succeeded (ATK-003).
const ESCAPED_RESULT = { escaped: true };

/** What execute(program) resolves to (SBX-005). */
export interface ExecuteOutcome {
  readonly result: unknown;
  readonly error: unknown;
  readonly facadeCalls: unknown;
  readonly isolateStartMs: unknown;
}

export type Execute = (program: string) => Promise<ExecuteOutcome>;

const EMPTY_OUTCOME: ExecuteOutcome = { result: null, error: null, facadeCalls: 0, isolateStartMs: null };

/**
 * Calls createSandbox with the demo's loader and a fixture-backed gate.
 * It does not catch: a contract case needs the error createSandbox throws.
 */
export async function buildSandbox(options: JsonObject): Promise<unknown> {
  const createSandbox = await loadExport(Exports.createSandbox);
  const openGate = await loadExport(Exports.openGate);
  const gate = await guarded("openGate()", () => openGate());

  return createSandbox({ loader: loaderBinding(), gate, ...options });
}

/** The real sandbox as an executor. Each outcome is checked against SBX-005. */
export async function sandboxExecutor(options: JsonObject): Promise<Execute> {
  const built = await guarded("createSandbox(options)", () => buildSandbox(options));
  const sandbox = expectObject(built, SANDBOX_SHAPE);
  const execute = sandbox[EXECUTE_KEY];

  if (typeof execute !== "function") {
    return fail(SANDBOX_SHAPE);
  }

  return async (program) => {
    const outcome = await guarded("execute(program)", () => execute.call(sandbox, program));

    return checkOutcome(outcome);
  };
}

export function inertExecutor(): Execute {
  return async () => EMPTY_OUTCOME;
}

export function escapedExecutor(): Execute {
  return async () => ({ ...EMPTY_OUTCOME, result: ESCAPED_RESULT });
}

/** Example: the canary "ghp_x" leaves as "Z2hwX3g=". */
export function leakyBase64Executor(canary: string): Execute {
  return leakyExecutor(btoa(canary));
}

export function leakyExecutor(canary: string): Execute {
  return async (program) => {
    if (!LISTS_ENV.test(program)) {
      return EMPTY_OUTCOME;
    }

    const leaked = { envKeys: [GATE_BINDING, LEAKED_BINDING], env: { [LEAKED_BINDING]: canary } };

    return { ...EMPTY_OUTCOME, result: leaked };
  };
}

function checkOutcome(outcome: unknown): ExecuteOutcome {
  const checked = expectObject(outcome, OUTCOME_SHAPE);

  for (const key of OUTCOME_KEYS) {
    if (!(key in checked)) {
      return fail(OUTCOME_SHAPE);
    }
  }

  return checked as unknown as ExecuteOutcome;
}
