/**
 * The executor the `code` tool drives: the sandbox, plus one report per run.
 *
 *   code tool (createCodeTool)
 *        |  execute(code)
 *        v
 *   createRecordedExecutor  -- onRun({ code, result, error, facadeCalls, isolateStartMs, durationMs }) --> ledger
 *        |  createSandbox({ loader: env.LOADER, gate }).execute(code)
 *        v
 *   mittens_sandbox
 *
 * The sandbox reports four values and nothing else. This service adds the
 * program text and the duration, and gives the tool the shape it expects.
 *
 * The sandbox counts gate calls inside the isolate, where the program can
 * skip the count. With a meter, the host's count replaces that one.
 */
import type { ExecuteResult, Executor } from "@cloudflare/codemode";
import { createSandbox } from "mittens_sandbox";
import type { GateMeter } from "./gate-meter";
import type { ProgramRun } from "./ledger";

export type RecordedExecutorOptions = {
  /** Loopback handle to GitHubGate. */
  gate: Fetcher;
  /** Limits for tests. Empty means the sandbox defaults. */
  limits?: { tickBudget?: number; timeoutMs?: number };
  /** The host's count of gate calls. Without it the run keeps the count of the sandbox. */
  meter?: GateMeter;
  /** Called once per run with the measurements for the ledger. */
  onRun?: (run: ProgramRun) => void;
};

export type RecordedExecutor = Executor & { run(code: string): Promise<ProgramRun> };

export function createRecordedExecutor(env: { LOADER: WorkerLoader }, options: RecordedExecutorOptions): RecordedExecutor {
  const sandbox = createSandbox({ loader: env.LOADER, gate: options.gate, ...options.limits });

  const run = async (code: string): Promise<ProgramRun> => {
    const startedAt = Date.now();
    options.meter?.start();

    const outcome = await sandbox.execute(code);
    const programRun = { ...outcome, ...hostCount(options.meter, startedAt), code, durationMs: Date.now() - startedAt };

    options.onRun?.(programRun);
    return programRun;
  };

  // The tool reads a failure from `error`. The sandbox has no logs to pass on.
  const execute = async (code: string): Promise<ExecuteResult> => {
    const programRun = await run(code);

    if (programRun.error !== null) {
      return { result: undefined, error: programRun.error, logs: [] };
    }

    return { result: programRun.result, logs: [] };
  };

  return { execute, run };
}

// Example: 1 call, 12 ms after the start, gives { facadeCalls: 1, isolateStartMs: 12 }.
function hostCount(meter: GateMeter | undefined, startedAt: number): Partial<Pick<ProgramRun, "facadeCalls" | "isolateStartMs">> {
  if (meter === undefined) {
    return {};
  }

  const use = meter.read();

  return { facadeCalls: use.calls, isolateStartMs: use.firstCallAt === null ? null : use.firstCallAt - startedAt };
}
