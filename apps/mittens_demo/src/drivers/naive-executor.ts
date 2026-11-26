/**
 * The naive executor: the mistake that Mittens exists to prevent.
 *
 *   mittens_sandbox                     naive executor
 *   env: { GH: gate }                   env: { GH: gate, GITHUB_TOKEN: <token> }
 *
 * It runs a program in a Dynamic Worker with the same loop budget, the same
 * timeout and no network, like the real sandbox. The difference that matters
 * is the common shortcut: the API token is handed to the isolate in its env.
 * The attack page runs the same eight attacks against both, and the one
 * breach in the report comes from that token. It is a smaller executor in
 * other ways too (no `github` proxy, no call count, no CPU limit): none of
 * those changes the verdict of an attack.
 *
 * Only the attack page uses this file, and only with the canary, which is not
 * a real token. The agent never runs a program here.
 */
import { applyBudget, BUDGET_ERROR_MESSAGE, GATE_BINDING, SANDBOX_COMPAT_DATE, TICK_IDENTIFIER, TIMEOUT_ERROR_MESSAGE } from "mittens_sandbox";

const MAIN_MODULE = "naive.js";
const PROGRAM_MODULE = "program.js";
const TOKEN_BINDING = "GITHUB_TOKEN";
const HOST_GRACE_MS = 2_000;

export type NaiveLimits = { tickBudget: number; timeoutMs: number };

/** The same four keys the real sandbox resolves to, so one report format serves both. */
export type NaiveOutcome = { result: unknown; error: string | null; facadeCalls: number; isolateStartMs: number | null };

type NaiveEntrypoint = { run(limits: NaiveLimits): Promise<{ result?: unknown; error?: string }> };

const NAIVE_SOURCE = `
import { WorkerEntrypoint } from "cloudflare:workers";
import makeProgram from "./${PROGRAM_MODULE}";

export default class Naive extends WorkerEntrypoint {
  async run(limits) {
    let ticks = 0;
    const tick = () => {
      ticks += 1;
      if (ticks > limits.tickBudget) { throw new Error(${JSON.stringify(BUDGET_ERROR_MESSAGE)}); }
    };

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(${JSON.stringify(TIMEOUT_ERROR_MESSAGE)})), limits.timeoutMs);
    });

    try {
      return { result: await Promise.race([makeProgram(tick)(), timeout]) };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error) };
    } finally {
      clearTimeout(timer);
    }
  }
}
`;

/** Returns an executor that runs each program with `token` in the isolate's env. */
export function createNaiveExecutor(loader: WorkerLoader, gate: Fetcher, token: string, limits: NaiveLimits) {
  return async (program: string): Promise<NaiveOutcome> => {
    try {
      const outcome = await runWithToken(loader, gate, token, limits, program);

      return { result: outcome.result ?? null, error: outcome.error ?? null, facadeCalls: 0, isolateStartMs: null };
    } catch (error) {
      return { result: null, error: error instanceof Error ? error.message : String(error), facadeCalls: 0, isolateStartMs: null };
    }
  };
}

async function runWithToken(loader: WorkerLoader, gate: Fetcher, token: string, limits: NaiveLimits, program: string) {
  const budgeted = applyBudget(program);

  if (!budgeted.ok) {
    return { error: budgeted.error };
  }

  const worker = loader.load({
    compatibilityDate: SANDBOX_COMPAT_DATE,
    mainModule: MAIN_MODULE,
    modules: {
      [MAIN_MODULE]: NAIVE_SOURCE,
      [PROGRAM_MODULE]: `export default (${TICK_IDENTIFIER}) => (${budgeted.code});\n`
    },
    // The mistake: the token is inside the isolate. Any program can read it.
    env: { [GATE_BINDING]: gate, [TOKEN_BINDING]: token },
    globalOutbound: null
  });

  const entrypoint = worker.getEntrypoint() as unknown as NaiveEntrypoint;

  // The host's own timer, for a run that never answers. It is cancelled when the run ends first.
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT_ERROR_MESSAGE)), limits.timeoutMs + HOST_GRACE_MS);
  });

  try {
    return await Promise.race([entrypoint.run(limits), expired]);
  } finally {
    clearTimeout(timer);
  }
}
