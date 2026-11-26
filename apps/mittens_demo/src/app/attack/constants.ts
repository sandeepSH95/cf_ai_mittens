/** The fixed words and values of the attack tab. */
import type { AttackRow } from "../../services/attack-run";

/** The verdict of one attack. "held" means the attack failed. */
export const Outcome = {
  Held: "held",
  Breached: "breached"
} as const satisfies Record<string, AttackRow["outcome"]>;

/** Where the page is between two clicks of the run button. */
export const RunPhase = {
  // Nothing was run. The cards show the attack names.
  Idle: "idle",

  // Both calls are in flight.
  Loading: "loading",

  // Both reports arrived.
  Done: "done",

  // One of the two calls failed.
  Failed: "failed"
} as const;

export type RunPhase = (typeof RunPhase)[keyof typeof RunPhase];

/** One table row. `outcome` is null until a report has the verdict. */
export type DisplayRow = { name: string; criterion: string; outcome: AttackRow["outcome"] | null; detail: string; code: string };

/**
 * The eight attacks, in the order of the report, for the time before the
 * first run. The names and criterion ids repeat ATTACK_PROGRAMS of
 * mittens_attack. The page does not import that package, so no sandbox code
 * enters the browser bundle. After a run the page shows the rows of the API.
 */
export const PENDING_ATTACKS: readonly Pick<DisplayRow, "name" | "criterion">[] = [
  { name: "network fetch", criterion: "SBX-001" },
  { name: "swallowed fetch", criterion: "SBX-001" },
  { name: "env inspection", criterion: "SBX-002" },
  { name: "direct write call", criterion: "GATE-001" },
  { name: "synchronous loop", criterion: "SBX-003" },
  { name: "asynchronous loop", criterion: "SBX-003" },
  { name: "recursion", criterion: "SBX-003" },
  { name: "never-resolving promise", criterion: "SBX-003" }
];

export const ATTACK_COUNT = PENDING_ATTACKS.length;

/**
 * What a correct run shows, per executor: the names of the attacks that must
 * be breached. The page prints this before the run, so a reader knows that
 * the breach in the naive executor is the point of the page and not a fault.
 */
export const EXPECTED_BREACHES = {
  // The real sandbox must hold every attack.
  mittens: [],

  // The control: the token is in env on purpose, so reading env must find it.
  naive: ["env inspection"]
} as const satisfies Record<string, readonly string[]>;

export const NOT_RUN_LABEL = "not run";
export const RUNNING_LABEL = "running";
export const FAILED_LABEL = "no report";
