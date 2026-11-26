/**
 * Sandbox driver: the only file of the three packages that uses the Worker Loader (Dynamic Workers).
 *
 *   host (Durable Object)                         fresh V8 isolate per run
 *   ──────────────────────                        ─────────────────────────
 *   createSandbox(...).execute(program)           main.js  (shim, fixed)
 *     normalizeCode  -> async () => {...}           - builds `github.*` wrappers over env.GH
 *     applyBudget    -> __tick() in every loop      - counts facade calls, time of first call
 *     LOADER.load({                                 - races a timeout
 *       env: { GH: <the gate handle> },           program.js (the model's code, spliced in)
 *       globalOutbound: null,  <- no fetch/connect   export default (github, __tick) => (<code>)
 *       limits: { cpuMs }      <- production stop
 *     })                                     RPC: github.listPullRequests(x) -> env.GH.listPullRequests(x)
 *
 * Security options are fixed here and cannot be overridden by callers:
 * globalOutbound is always null, the env holds exactly one binding (GH), and
 * no secret is ever placed in the dynamic worker's env. createSandbox refuses
 * every option it does not know, so no caller can add one.
 */
import { normalizeCode } from "@cloudflare/codemode";
import { applyBudget, TICK_IDENTIFIER } from "./budget";

/** The global the program calls, for example `github.listPullRequests({ state: "open" })`. */
export const SANDBOX_NAMESPACE = "github";
/** The one binding inside the isolate. It is a loopback stub, not a secret. */
export const GATE_BINDING = "GH";
export const SANDBOX_COMPAT_DATE = "2026-11-01";

const MAIN_MODULE = "main.js";
const PROGRAM_MODULE = "program.js";

export const DEFAULT_TIMEOUT_MS = 10_000;
export const DEFAULT_CPU_MS = 100;
export const DEFAULT_TICK_BUDGET = 2_000_000;
/** Extra time the host waits past the sandbox's own timer before giving up. */
const HOST_GRACE_MS = 2_000;

export const BUDGET_ERROR_MESSAGE = "Program stopped: iteration budget exceeded (runaway loop or recursion)";
export const TIMEOUT_ERROR_MESSAGE = "Program stopped: execution timed out";
/** Reported when a program throws a value with no text. Example: throw new Error(""). An empty error would read as "no error". */
export const EMPTY_ERROR_MESSAGE = "Program failed: it threw an error with no message";

/** What execute(program) resolves to. All four keys are always present. */
export type SandboxOutcome = {
  /** The value the program returned. Null when it failed or returned nothing. */
  result: unknown;
  error: string | null;
  /** Gate calls made by this one program (RPC calls to the host). */
  facadeCalls: number;
  /** Milliseconds from LOADER.load() to the first gate call. Null when the program made none. */
  isolateStartMs: number | null;
};

export type SandboxOptions = {
  /** The Worker Loader binding. Example: env.LOADER. */
  loader: WorkerLoader;
  /** Loopback handle to the gate entrypoint. The host creates it with ctx.exports. */
  gate: Fetcher;
  tickBudget?: number;
  timeoutMs?: number;
  cpuMs?: number;
};

export type Sandbox = { execute(program: string): Promise<SandboxOutcome> };

const SandboxOption = { Loader: "loader", Gate: "gate", TickBudget: "tickBudget", TimeoutMs: "timeoutMs", CpuMs: "cpuMs" } as const;
const REQUIRED_OPTIONS: readonly string[] = [SandboxOption.Loader, SandboxOption.Gate];
const NUMBER_OPTIONS: readonly string[] = [SandboxOption.TickBudget, SandboxOption.TimeoutMs, SandboxOption.CpuMs];
const KNOWN_OPTIONS: readonly string[] = [...REQUIRED_OPTIONS, ...NUMBER_OPTIONS];
/** Lower bounds so a caller cannot disable the protections. A lower value is refused, not raised. */
const MINIMUMS: Readonly<Record<string, number>> = { [SandboxOption.TickBudget]: 1_000, [SandboxOption.TimeoutMs]: 500, [SandboxOption.CpuMs]: 10 };
/** Upper bounds so a caller cannot make a protection useless. Example: a budget no program reaches. A higher value is refused, not lowered. */
const MAXIMUMS: Readonly<Record<string, number>> = { [SandboxOption.TickBudget]: 10_000_000, [SandboxOption.TimeoutMs]: 30_000, [SandboxOption.CpuMs]: 30_000 };
const ERROR_PREFIX = "createSandbox:";

type Limits = { tickBudget: number; timeoutMs: number; cpuMs: number };

type ShimOutcome = {
  result?: unknown;
  error?: string;
  facadeCalls: number;
  firstCallAt: number | null;
};

type ShimEntrypoint = {
  run(options: { budget: number; timeoutMs: number }): Promise<ShimOutcome>;
};

/**
 * Fixed shim loaded as the isolate's main module. It never changes per run.
 * The program only ever receives the `github` proxy and `__tick`.
 */
const SHIM_SOURCE = `
import { WorkerEntrypoint } from "cloudflare:workers";
import makeProgram from "./${PROGRAM_MODULE}";

const BUDGET_ERROR = ${JSON.stringify(BUDGET_ERROR_MESSAGE)};
const TIMEOUT_ERROR = ${JSON.stringify(TIMEOUT_ERROR_MESSAGE)};
const EMPTY_ERROR = ${JSON.stringify(EMPTY_ERROR_MESSAGE)};

export default class Sandbox extends WorkerEntrypoint {
  async run(options) {
    const metrics = { facadeCalls: 0, firstCallAt: null };

    // Every property of \`github\` is a call to the gate on the host. Count it.
    // Example: github.listPullRequests(x) -> env.${GATE_BINDING}.listPullRequests(x).
    // The gate decides which methods exist; a write method is rejected there.
    const gate = this.env.${GATE_BINDING};
    const forward = (method) => async (input) => {
      metrics.facadeCalls += 1;
      if (metrics.firstCallAt === null) { metrics.firstCallAt = Date.now(); }
      return gate[method](input === undefined ? {} : input);
    };
    const facade = new Proxy(Object.freeze({}), {
      // "then" stays undefined so \`await github\` does not turn into a gate call.
      get: (_target, method) => (typeof method !== "string" || method === "then" ? undefined : forward(method))
    });

    let ticks = 0;
    const tick = () => {
      ticks += 1;
      if (ticks > options.budget) { throw new Error(BUDGET_ERROR); }
    };

    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(TIMEOUT_ERROR)), options.timeoutMs);
    });

    try {
      const program = makeProgram(facade, tick);
      const result = await Promise.race([program(), timeout]);
      return { result, ...metrics };
    } catch (error) {
      // An empty text would read as "no error" on the host, so a failed run always carries a text.
      const text = error instanceof Error ? error.message : String(error);
      return { error: text === "" ? EMPTY_ERROR : text, ...metrics };
    } finally {
      clearTimeout(timer);
    }
  }
}
`;

function programModule(instrumented: string): string {
  return `export default (${SANDBOX_NAMESPACE}, ${TICK_IDENTIFIER}) => (${instrumented});\n`;
}

/**
 * Builds the sandbox. The returned object has one own key, `execute`.
 * Throws a TypeError on an unknown option, a missing loader or gate, or a
 * limit that is not a positive number, is below its minimum or is above its maximum.
 * Example: createSandbox({ loader: env.LOADER, gate, tickBudget: 10_000 }).
 */
export function createSandbox(options: SandboxOptions): Sandbox {
  const limits = checkOptions(options);
  const { loader, gate } = options;

  return { execute: (program) => runProgram(loader, gate, limits, program) };
}

// Refuses what the caller must not set (example: globalOutbound) before anything is loaded.
function checkOptions(options: SandboxOptions): Limits {
  if (typeof options !== "object" || options === null) {
    throw new TypeError(`${ERROR_PREFIX} options must be an object`);
  }

  const given = options as Record<string, unknown>;

  for (const key of Object.keys(given)) {
    if (!KNOWN_OPTIONS.includes(key)) {
      throw new TypeError(`${ERROR_PREFIX} unknown option '${key}'`);
    }
  }

  for (const key of REQUIRED_OPTIONS) {
    if (given[key] === undefined || given[key] === null) {
      throw new TypeError(`${ERROR_PREFIX} option '${key}' is required`);
    }
  }

  for (const key of NUMBER_OPTIONS) {
    const value = given[key];

    if (value !== undefined && !(typeof value === "number" && Number.isFinite(value) && value > 0)) {
      throw new TypeError(`${ERROR_PREFIX} '${key}' must be a positive number`);
    }

    // Example: tickBudget 10 throws "createSandbox: 'tickBudget' must be at least 1000".
    if (value !== undefined && value < MINIMUMS[key]) {
      throw new TypeError(`${ERROR_PREFIX} '${key}' must be at least ${MINIMUMS[key]}`);
    }

    // Example: tickBudget 100000001 throws "createSandbox: 'tickBudget' must be at most 10000000".
    if (value !== undefined && value > MAXIMUMS[key]) {
      throw new TypeError(`${ERROR_PREFIX} '${key}' must be at most ${MAXIMUMS[key]}`);
    }
  }

  return {
    tickBudget: options.tickBudget ?? DEFAULT_TICK_BUDGET,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    cpuMs: options.cpuMs ?? DEFAULT_CPU_MS
  };
}

/** Runs one program in a fresh isolate. Never rejects: a failure is in `error`. */
async function runProgram(loader: WorkerLoader, gate: Fetcher, limits: Limits, program: string): Promise<SandboxOutcome> {
  const startedAt = Date.now();
  let outcome: ShimOutcome;

  try {
    outcome = await runInIsolate(loader, gate, limits, program);
  } catch (error) {
    outcome = { error: error instanceof Error ? error.message : String(error), facadeCalls: 0, firstCallAt: null };
  }

  const failed = outcome.error !== undefined;

  return {
    result: failed ? null : (outcome.result ?? null),
    error: outcome.error ?? null,
    facadeCalls: outcome.facadeCalls,
    isolateStartMs: outcome.firstCallAt === null ? null : outcome.firstCallAt - startedAt
  };
}

async function runInIsolate(loader: WorkerLoader, gate: Fetcher, limits: Limits, program: string): Promise<ShimOutcome> {
  const budgeted = applyBudget(normalizeCode(String(program)));

  if (!budgeted.ok) {
    return { error: budgeted.error, facadeCalls: 0, firstCallAt: null };
  }

  const worker = loader.load({
    compatibilityDate: SANDBOX_COMPAT_DATE,
    mainModule: MAIN_MODULE,
    modules: {
      [MAIN_MODULE]: SHIM_SOURCE,
      [PROGRAM_MODULE]: programModule(budgeted.code)
    },
    // The only binding. A loopback stub to the gate; it carries no token bytes.
    env: { [GATE_BINDING]: gate },
    // No network at all: fetch() and connect() throw inside the isolate.
    globalOutbound: null,
    // Production hard stop. Local workerd ignores it; see budget.ts.
    limits: { cpuMs: limits.cpuMs }
  });

  const entrypoint = worker.getEntrypoint() as unknown as ShimEntrypoint;

  const hostTimer = startHostTimer(limits.timeoutMs + HOST_GRACE_MS);

  try {
    return await Promise.race([entrypoint.run({ budget: limits.tickBudget, timeoutMs: limits.timeoutMs }), hostTimer.expired]);
  } finally {
    // A run that ended in time must not leave its timer pending in the host.
    hostTimer.cancel();
    dispose(entrypoint);
    dispose(worker);
  }
}

/** The host's own timer. `expired` rejects after `ms`. `cancel` stops it when the run ended first. */
function startHostTimer(ms: number): { expired: Promise<never>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;

  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(TIMEOUT_ERROR_MESSAGE)), ms);
  });

  return { expired, cancel: () => clearTimeout(timer) };
}

// Stubs expose Symbol.dispose; releasing them lets the isolate go away.
function dispose(value: unknown): void {
  const disposable = value as { [Symbol.dispose]?: () => void } | null;

  try {
    disposable?.[Symbol.dispose]?.();
  } catch {
    // Already gone. Nothing to do.
  }
}
