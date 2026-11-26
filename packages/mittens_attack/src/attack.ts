/**
 * Runs the attack programs against any executor.
 *
 *   attackSandbox({ execute, canary })
 *        |  for each attack, in the order of ATTACK_PROGRAMS:
 *        v
 *   execute(attack.code)  -> whatever the executor reports (result, error, ...)
 *        |
 *        v  does the program's result hold escaped: true?
 *        v  do the canary's bytes appear anywhere in it, as plain text or in base64?
 *   { name, outcome: "held" | "breached", detail }
 *        |
 *        v
 *   { cases: [...], breached: <count of breached cases> }
 *
 * The suite judges two things: the token must not come back, and no program
 * may report that its forbidden action succeeded. What an executor returns
 * for a held attack (its error text, its binding names) belongs to the
 * executor, so its own tests assert on that.
 */
import { ATTACK_PROGRAMS, ESCAPED_KEY, type AttackProgram } from "./programs";

export const AttackOutcome = { Held: "held", Breached: "breached" } as const;
export type AttackOutcome = (typeof AttackOutcome)[keyof typeof AttackOutcome];

/** Any executor. Example: the `execute` of mittens_sandbox's createSandbox. */
export type AttackExecute = (program: string) => unknown;

export type AttackOptions = { execute: AttackExecute; canary: string };
export type AttackCase = { name: string; outcome: AttackOutcome; detail: string };
export type AttackReport = { cases: AttackCase[]; breached: number };

const EXECUTE_ERROR = "attackSandbox: execute must be a function";
const CANARY_ERROR = "attackSandbox: canary must be a non-empty string";
const HELD_DETAIL = "the program did not escape and the canary is not in the result or the error";
const BREACHED_DETAIL = "the canary came back from the executor";
const ESCAPED_DETAIL = "the program reported that its forbidden action succeeded";

const BASE64_GROUP_BYTES = 3;
/** Base64 characters at the start of a needle that also depend on the 0, 1 or 2 bytes in front of the canary. */
const MIXED_HEAD_CHARS = [0, 2, 3] as const;
/** Base64 characters at the end of a needle (padding included) that also depend on the bytes behind the canary, by the bytes left over in the last group. */
const MIXED_TAIL_CHARS = [0, 3, 2] as const;

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

  if (reportsEscape(reported)) {
    return { name: attack.name, outcome: AttackOutcome.Breached, detail: ESCAPED_DETAIL };
  }

  if (holdsCanary(reported, canaryNeedles(options.canary))) {
    return { name: attack.name, outcome: AttackOutcome.Breached, detail: BREACHED_DETAIL };
  }

  return { name: attack.name, outcome: AttackOutcome.Held, detail: HELD_DETAIL };
}

// Each program of the suite returns { escaped: true } when its forbidden action succeeded.
// Example: { result: { escaped: true, status: 200 }, error: null } reports an escape.
function reportsEscape(reported: unknown): boolean {
  try {
    const result = (reported as { result?: unknown } | null)?.result;

    return (result as Record<string, unknown> | null)?.[ESCAPED_KEY] === true;
  } catch {
    // A value that throws when it is read reports nothing.
    return false;
  }
}

/**
 * The texts that give the canary away: the canary itself, and its base64 form.
 *
 * Base64 turns 3 bytes into 4 characters, so the form depends on where the
 * canary starts in the encoded text. There are three alignments. The
 * characters at both ends that mix in neighbour bytes are cut off:
 *
 *   btoa("tok")   = "dG9r"      alignment 0: every character is the canary's
 *   btoa("xtok")  = "eHRvaw=="  alignment 1: "eH" mixes in "x", "w==" mixes in what follows
 *   btoa("xxtok") = "eHh0b2s="  alignment 2: "eHh" mixes in "xx", "s=" mixes in what follows
 */
function canaryNeedles(canary: string): string[] {
  const bytes = new TextEncoder().encode(canary);
  const needles = [canary];

  for (let lead = 0; lead < BASE64_GROUP_BYTES; lead += 1) {
    const padded = new Uint8Array(lead + bytes.length);
    padded.set(bytes, lead);

    const encoded = btoa(String.fromCharCode(...padded));
    const leftOver = padded.length % BASE64_GROUP_BYTES;
    const needle = encoded.slice(MIXED_HEAD_CHARS[lead], encoded.length - MIXED_TAIL_CHARS[leftOver]);

    // A very short canary leaves no character of its own in some alignments.
    if (needle !== "") {
      needles.push(needle);
    }
  }

  return needles;
}

// Looks at every string the executor reported: values, object keys, error
// messages, whatever the nesting. Example: { result: { env: { T: "<canary>" } } } holds it.
function holdsCanary(reported: unknown, needles: string[]): boolean {
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

    const text = String(value);

    if (needles.some((needle) => text.includes(needle))) {
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
