/**
 * Composes one chat turn: model driver, sandbox executor (with ledger
 * recording) and the two tools. The agent calls only this.
 */
import type { Executor } from "@cloudflare/codemode";
import type { LanguageModel, ToolSet } from "ai";
import { createAgentTools, EXAMPLE_PROGRAM, MAX_STEPS, SYSTEM_PROMPT, ToolName, type GitHubReads, type GitHubWrites } from "mittens_gate";
import { createRecordedExecutor } from "./executor";
import { createReads } from "./facade";
import type { GateMeter } from "./gate-meter";
import { type Ledger, type LedgerRow } from "./ledger";
import { createWrites } from "./plan";
import { modelDriverFor } from "./seam";

export type TurnOptions = {
  /** Loopback binding to GitHubGate, made by the agent with ctx.exports. */
  gate: Fetcher;
  ledger: Ledger;
  /** The host's count of gate calls for this turn's gate handle. */
  meter?: GateMeter;
  /** Called after each program run was written to the ledger. */
  onRecorded?: (row: LedgerRow) => void;
  /** The name of the agent instance. A test replaces the drivers of one agent by it (services/seam.ts). */
  scope?: string;
};

export type Turn = { model: LanguageModel; modelId: string; maxOutputTokens: number; tools: ToolSet; system: string; stepLimit: number };

/** What the agent holds of the gate: the reads, the writes, the tools made of them and the step limit. */
export type GateParts = { reads: GitHubReads; writes: GitHubWrites; tools: ToolSet; stepLimit: number };

/**
 * Builds the reads with defineReads, the writes with defineWrites, and the
 * two tools from them. prepareTurn uses it, and so does the testing entry,
 * so both see the same values.
 */
export function createGateParts(env: Env, executor: Executor, scope?: string): GateParts {
  const reads = createReads(env, { scope });
  const writes = createWrites(env, scope);
  const tools = createAgentTools({ executor, reads, writes });

  return { reads, writes, tools, stepLimit: MAX_STEPS };
}

export function prepareTurn(env: Env, options: TurnOptions): Turn {
  const executor = createRecordedExecutor(env, {
    gate: options.gate,
    meter: options.meter,
    onRun: (run) => {
      const row = options.ledger.recordRun(run);
      options.onRecorded?.(row);
    }
  });

  const script = { codeTool: ToolName.Code, applyTool: ToolName.ApplyWrites, program: EXAMPLE_PROGRAM };
  const driver = modelDriverFor(env, script, options.scope);

  const parts = createGateParts(env, executor, options.scope);

  return {
    model: driver.model(),
    modelId: driver.modelId,
    maxOutputTokens: driver.maxOutputTokens,
    tools: parts.tools,
    system: SYSTEM_PROMPT,
    stepLimit: parts.stepLimit
  };
}
