/**
 * The one client of the attack API. Components call this module and never `fetch`.
 *
 *   AttackTab --> fetchBothRuns() --> GET /api/attacks/mittens
 *                                 --> GET /api/attacks/naive     (in parallel)
 */
import type { AttackRun, AttackTarget } from "../../services/attack-run";

const ATTACKS_ROUTE = "/api/attacks/";
const JSON_TYPE = "application/json";

/** The two executors. The values are the last segment of the route. */
export const Target = {
  Mittens: "mittens",
  Naive: "naive"
} as const satisfies Record<string, AttackTarget>;

/** One report per executor, from one click. */
export type AttackRuns = { mittens: AttackRun; naive: AttackRun };

/** Runs the eight attacks against both executors. Rejects if one of the two calls fails. */
export async function fetchBothRuns(): Promise<AttackRuns> {
  const [mittens, naive] = await Promise.all([fetchRun(Target.Mittens), fetchRun(Target.Naive)]);

  return { mittens, naive };
}

async function fetchRun(target: AttackTarget): Promise<AttackRun> {
  const response = await fetch(`${ATTACKS_ROUTE}${target}`, { headers: { accept: JSON_TYPE } });

  // A status outside 200 to 299 has no report in its body. Example: "The naive run failed: HTTP 500."
  if (!response.ok) {
    throw new Error(`The ${target} run failed: HTTP ${response.status}.`);
  }

  return (await response.json()) as AttackRun;
}
