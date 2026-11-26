/**
 * Runs the attack programs against any executor.
 *
 *   attackSandbox({ execute, canary })
 *        |  for each attack, in the order of ATTACK_PROGRAMS:
 *        v
 *   execute(attack.code)  -> whatever the executor reports (result, error, logs, ...)
 *        |
 *        v  do the canary's bytes appear anywhere in it?
 *   { name, outcome: "held" | "breached", detail }
 *        |
 *        v
 *   { cases: [...], breached: <count of breached cases> }
 *
 * The suite judges one thing: the token must not come back. What an executor
 * returns for a held attack (its error text, its binding names) belongs to
 * the executor, so its own tests assert on that.
 */
import { ATTACK_PROGRAMS, type AttackProgram } from "./programs";

export const AttackOutcome = { Held: "held", Breached: "breached" } as const;
export type AttackOutcome = (typeof AttackOutcome)[keyof typeof AttackOutcome];

/** Any executor. Example: the `execute` of mittens_sandbox's createSandbox. */
export type AttackExecute = (program: string) => unknown;

export type AttackOptions = { execute: AttackExecute; canary: string };
export type AttackCase = { name: string; outcome: AttackOutcome; detail: string };
export type AttackReport = { cases: AttackCase[]; breached: number };

const EXECUTE_ERROR = "attackSandbox: execute must be a function";
const CANARY_ERROR = "attackSandbox: canary must be a non-empty string";
const HELD_DETAIL = "the canary is not in the result, the error or the logs";
const BREACHED_DETAIL = "the canary came back from the executor";

/** Runs every attack in order and reports which ones got the canary out. */
export async function attackSandbox(options: AttackOptions): Promise<AttackReport> {
  if (typeof options?.execute !== "function") {
    throw new TypeError(EXECUTE_ERROR);
  }

  if (typeof options.canary !== "string" || options.canary === "") {
    throw new TypeError(CANARY_ERROR);
  }

  const cases: AttackCase[] = [];

  for (const attack of ATTACK_PROGRAMS) {
    cases.push(await runAttack(options, attack));
  }

  const breached = cases.filter((attackCase) => attackCase.outcome === AttackOutcome.Breached).length;

  return { cases, breached };
}

async function runAttack(options: AttackOptions, attack: AttackProgram): Promise<AttackCase> {
  let reported: unknown;

  // An executor that throws still reports something: its error can carry the canary.
  try {
    reported = await options.execute(attack.code);
  } catch (error) {
    reported = error;
  }

  if (holdsCanary(reported, options.canary)) {
    return { name: attack.name, outcome: AttackOutcome.Breached, detail: BREACHED_DETAIL };
  }

  return { name: attack.name, outcome: AttackOutcome.Held, detail: HELD_DETAIL };
}

// Looks at every string the executor reported: values, object keys, error
// messages, whatever the nesting. Example: { result: { env: { T: "<canary>" } } } holds it.
function holdsCanary(reported: unknown, canary: string): boolean {
  const seen = new Set<object>();
  const pending: unknown[] = [reported];

  while (pending.length > 0) {
    const value = pending.pop();

    if (typeof value === "function" || (typeof value === "object" && value !== null)) {
      if (seen.has(value)) {
        continue;
      }

      seen.add(value);
      pending.push(...textOf(value), ...parts(value));
      continue;
    }

    if (String(value).includes(canary)) {
      return true;
    }
  }

  return false;
}

// An Error keeps its message and stack on properties that are not enumerable.
function textOf(value: object): string[] {
  if (!(value instanceof Error)) {
    return [];
  }

  return [value.name, value.message, value.stack ?? ""];
}

// The keys and the values of an object or the items of a list. A value that
// throws when it is read (a proxy, a getter) is left out.
function parts(value: object): unknown[] {
  try {
    if (value instanceof Map) {
      return [...value.keys(), ...value.values()];
    }

    if (value instanceof Set) {
      return [...value];
    }

    return [...Object.keys(value), ...Object.values(value)];
  } catch {
    return [];
  }
}
