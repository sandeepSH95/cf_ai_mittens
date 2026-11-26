/**
 * Composes one chat turn: model driver, sandbox executor (with ledger
 * recording) and the two tools. The agent calls only this.
 */
import type { Executor } from "@cloudflare/codemode";
import type { LanguageModel, ToolSet } from "ai";
import { createAgentTools, EXAMPLE_PROGRAM, MAX_STEPS, SYSTEM_PROMPT, ToolName, type GitHubReads, type GitHubWrites } from "mittens_gate";
import { createModelDriver } from "../drivers/model";
import { createRecordedExecutor } from "./executor";
import { createReads } from "./facade";
import { type Ledger, type LedgerRow } from "./ledger";
import { createWrites } from "./plan";

export type TurnOptions = {
  /** Loopback binding to GitHubGate, made by the agent with ctx.exports. */
  gate: Fetcher;
  ledger: Ledger;
  /** Called after each program run was written to the ledger. */
  onRecorded?: (row: LedgerRow) => void;
};

export type Turn = { model: LanguageModel; modelId: string; tools: ToolSet; system: string; stepLimit: number };

/** What the agent holds of the gate: the reads, the writes, the tools made of them and the step limit. */
export type GateParts = { reads: GitHubReads; writes: GitHubWrites; tools: ToolSet; stepLimit: number };

/**
 * Builds the reads with defineReads, the writes with defineWrites, and the
 * two tools from them. prepareTurn uses it, and so does the testing entry,
 * so both see the same values.
 */
export function createGateParts(env: Env, executor: Executor): GateParts {
  const reads = createReads(env);
  const writes = createWrites(env);
  const tools = createAgentTools({ executor, reads, writes });

  return { reads, writes, tools, stepLimit: MAX_STEPS };
}

export function prepareTurn(env: Env, options: TurnOptions): Turn {
  const executor = createRecordedExecutor(env, {
    gate: options.gate,
    onRun: (run) => {
      const row = options.ledger.recordRun(run);
      options.onRecorded?.(row);
    }
  });

  const driver = createModelDriver(env, {
    codeTool: ToolName.Code,
    applyTool: ToolName.ApplyWrites,
    program: EXAMPLE_PROGRAM
  });

  const parts = createGateParts(env, executor);

  return { model: driver.model(), modelId: driver.modelId, tools: parts.tools, system: SYSTEM_PROMPT, stepLimit: parts.stepLimit };
}
