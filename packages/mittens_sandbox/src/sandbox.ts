/**
 * Sandbox driver: the ONLY file that uses env.LOADER (Dynamic Workers).
 *
 *   host (Durable Object)                         fresh V8 isolate per run
 *   ──────────────────────                        ─────────────────────────
 *   SandboxExecutor.execute(code)                 main.js  (shim, fixed)
 *     normalizeCode  -> async () => {...}           - builds `github.*` wrappers over env.GH
 *     applyBudget    -> __tick() in every loop      - counts facade calls, time of first call
 *     LOADER.load({                                 - captures console, races a timeout
 *       env: { GH: <loopback to GitHubGate> },    program.js (the model's code, spliced in)
 *       globalOutbound: null,  <- no fetch/connect   export default (github, __tick) => (<code>)
 *       limits: { cpuMs }      <- production stop
 *     })                                     RPC: github.listPullRequests(x) -> env.GH.listPullRequests(x)
 *
 * Security options are fixed here and cannot be overridden by callers:
 * globalOutbound is always null, the env holds exactly one binding (GH), and
 * no secret is ever placed in the dynamic worker's env.
 */
import type { ExecuteResult, Executor, ResolvedProvider } from "@cloudflare/codemode";
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
/** Lower bounds so a caller cannot disable the protections. */
const MIN_TIMEOUT_MS = 500;
const MIN_CPU_MS = 10;
const MIN_TICK_BUDGET = 1_000;

export const SandboxStop = { Budget: "budget", Timeout: "timeout" } as const;
export const BUDGET_ERROR_MESSAGE = "Program stopped: iteration budget exceeded (runaway loop or recursion)";
export const TIMEOUT_ERROR_MESSAGE = "Program stopped: execution timed out";

export type SandboxRun = {
  code: string;
  result: unknown;
  error: string | null;
  logs: string[];
  /** Facade calls made by this one program (RPC calls to the gate). */
  facadeCalls: number;
  /** Milliseconds from LOADER.load() to the first facade call. Null when the program made none. */
  isolateStartMs: number | null;
  durationMs: number;
};

export type SandboxOptions = {
  /** Loopback service binding to GitHubGate. The host creates it with ctx.exports. */
  gate: Fetcher;
  /** Facade method names exposed as `github.<name>` inside the isolate. */
  methods: readonly string[];
  timeoutMs?: number;
  cpuMs?: number;
  tickBudget?: number;
  /** Called once per run with the measurements for the ledger. */
  onRun?: (run: SandboxRun) => void;
};

type ShimOutcome = {
  result?: unknown;
  error?: string;
  logs: string[];
  facadeCalls: number;
  firstCallAt: number | null;
};

type ShimEntrypoint = {
  run(options: { methods: string[]; budget: number; timeoutMs: number }): Promise<ShimOutcome>;
};

/**
 * Fixed shim loaded as the isolate's main module. It never changes per run.
 * The program only ever receives the frozen `github` object and `__tick`.
 */
const SHIM_SOURCE = `
import { WorkerEntrypoint } from "cloudflare:workers";
import makeProgram from "./${PROGRAM_MODULE}";

const BUDGET_ERROR = ${JSON.stringify(BUDGET_ERROR_MESSAGE)};
const TIMEOUT_ERROR = ${JSON.stringify(TIMEOUT_ERROR_MESSAGE)};

export default class Sandbox extends WorkerEntrypoint {
  async run(options) {
    const logs = [];
    const metrics = { facadeCalls: 0, firstCallAt: null };
    const capture = (prefix) => (...args) => { logs.push(prefix + args.map(String).join(" ")); };
    console.log = capture("");
    console.warn = capture("[warn] ");
    console.error = capture("[error] ");

    // Every facade call is an RPC to the gate on the host. Count it.
    const gate = this.env.${GATE_BINDING};
    const facade = {};
    for (const method of options.methods) {
      facade[method] = async (input) => {
        metrics.facadeCalls += 1;
        if (metrics.firstCallAt === null) { metrics.firstCallAt = Date.now(); }
        return gate[method](input === undefined ? {} : input);
      };
    }
    Object.freeze(facade);

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
      return { result, logs, ...metrics };
    } catch (error) {
      return { error: error instanceof Error ? error.message : String(error), logs, ...metrics };
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
 * Implements the @cloudflare/codemode Executor contract so createCodeTool can
 * drive it. The `providers` argument is accepted for the contract but the
 * host-side functions in it are not used: calls go to the gate over RPC so
 * the program and the token are never in the same isolate.
 */
export class SandboxExecutor implements Executor {
  readonly #loader: WorkerLoader;
  readonly #gate: Fetcher;
  readonly #methods: string[];
  readonly #timeoutMs: number;
  readonly #cpuMs: number;
  readonly #tickBudget: number;
  readonly #onRun: ((run: SandboxRun) => void) | undefined;

  constructor(loader: WorkerLoader, options: SandboxOptions) {
    this.#loader = loader;
    this.#gate = options.gate;
    this.#methods = [...options.methods];
    this.#timeoutMs = Math.max(MIN_TIMEOUT_MS, options.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    this.#cpuMs = Math.max(MIN_CPU_MS, options.cpuMs ?? DEFAULT_CPU_MS);
    this.#tickBudget = Math.max(MIN_TICK_BUDGET, options.tickBudget ?? DEFAULT_TICK_BUDGET);
    this.#onRun = options.onRun;
  }

  async execute(code: string, _providers?: ResolvedProvider[] | Record<string, unknown>): Promise<ExecuteResult> {
    const run = await this.run(code);

    if (run.error !== null) {
      return { result: undefined, error: run.error, logs: run.logs };
    }

    return { result: run.result, logs: run.logs };
  }

  /** Runs one program and returns the measurements. Never throws. */
  async run(code: string): Promise<SandboxRun> {
    const startedAt = Date.now();
    const budgeted = applyBudget(normalizeCode(code));

    if (!budgeted.ok) {
      return this.#finish({ code, result: undefined, error: budgeted.error, logs: [], facadeCalls: 0, isolateStartMs: null, durationMs: Date.now() - startedAt });
    }

    const worker = this.#loader.load({
      compatibilityDate: SANDBOX_COMPAT_DATE,
      mainModule: MAIN_MODULE,
      modules: {
        [MAIN_MODULE]: SHIM_SOURCE,
        [PROGRAM_MODULE]: programModule(budgeted.code)
      },
      // The only binding. A loopback stub to GitHubGate; it carries no token bytes.
      env: { [GATE_BINDING]: this.#gate },
      // No network at all: fetch() and connect() throw inside the isolate.
      globalOutbound: null,
      // Production hard stop. Local workerd ignores it; see budget.ts.
      limits: { cpuMs: this.#cpuMs }
    });

    const entrypoint = worker.getEntrypoint() as unknown as ShimEntrypoint;
    let outcome: ShimOutcome;

    try {
      outcome = await Promise.race([
        entrypoint.run({ methods: this.#methods, budget: this.#tickBudget, timeoutMs: this.#timeoutMs }),
        hostTimeout(this.#timeoutMs + HOST_GRACE_MS)
      ]);
    } catch (error) {
      outcome = { error: error instanceof Error ? error.message : String(error), logs: [], facadeCalls: 0, firstCallAt: null };
    } finally {
      dispose(entrypoint);
      dispose(worker);
    }

    return this.#finish({
      code,
      result: outcome.result,
      error: outcome.error ?? null,
      logs: outcome.logs ?? [],
      facadeCalls: outcome.facadeCalls,
      isolateStartMs: outcome.firstCallAt === null ? null : outcome.firstCallAt - startedAt,
      durationMs: Date.now() - startedAt
    });
  }

  #finish(run: SandboxRun): SandboxRun {
    this.#onRun?.(run);
    return run;
  }
}

/** Builds the executor. Callers pass the whole env; only this file reads LOADER. */
export function createSandbox(env: { LOADER: WorkerLoader }, options: SandboxOptions): SandboxExecutor {
  return new SandboxExecutor(env.LOADER, options);
}

function hostTimeout(ms: number): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(TIMEOUT_ERROR_MESSAGE)), ms));
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
