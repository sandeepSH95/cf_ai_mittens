/**
 * Composes one chat turn: model driver, sandbox executor (with ledger
 * recording) and the two tools. The agent calls only this.
 */
import type { LanguageModel, ToolSet } from "ai";
import { createAgentTools, EXAMPLE_PROGRAM, FACADE_METHODS, SYSTEM_PROMPT, ToolName } from "mittens_gate";
import { createSandbox } from "mittens_sandbox";
import { createModelDriver } from "../drivers/model";
import { type Ledger, type LedgerRow } from "./ledger";
import { createPlanApplier } from "./plan";

export type TurnOptions = {
  /** Loopback binding to GitHubGate, made by the agent with ctx.exports. */
  gate: Fetcher;
  ledger: Ledger;
  /** Called after each program run was written to the ledger. */
  onRecorded?: (row: LedgerRow) => void;
};

export type Turn = { model: LanguageModel; modelId: string; tools: ToolSet; system: string };

export function prepareTurn(env: Env, options: TurnOptions): Turn {
  const executor = createSandbox(env, {
    gate: options.gate,
    methods: FACADE_METHODS,
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

  const tools = createAgentTools({ executor, applyPlan: createPlanApplier(env) });

  return { model: driver.model(), modelId: driver.modelId, tools, system: SYSTEM_PROMPT };
}
