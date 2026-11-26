/**
 * The testing entry's agentParts() (contract, section 3) and the read
 * validation as a program sees it through the real sandbox (GATE-004).
 */
import { MAX_STEPS, ToolName } from "mittens_gate";
import { describe, expect, it } from "vitest";
import { agentParts } from "../src/testing";
import { inAgent, runProgram } from "./support";

const BAD_INPUT_PROGRAM = `async () => {
  try {
    await github.getPullRequest({ number: "101" });
    return { rejected: false };
  } catch (error) {
    return { rejected: true, message: error.message };
  }
}`;

describe("agentParts", () => {
  it("reports the two tools and the step limit of the agent", async () => {
    const parts = await inAgent(async () => agentParts());

    expect([...parts.toolNames].sort()).toEqual([ToolName.ApplyWrites, ToolName.Code]);
    expect(parts.stepLimit).toBe(MAX_STEPS);
  });

  it("holds the values of defineReads and defineWrites", async () => {
    const parts = await inAgent(async () => agentParts());

    expect(Object.keys(parts.reads).sort()).toEqual(["facade", "spec"]);
    expect(Object.keys(parts.writes).sort()).toEqual(["applyWritesTool", "planSpec", "validatePlan"]);
    expect(parts.reads.spec()).toContain("getPullRequest(input: { number: number }): Promise<PullRequest>;");
    expect(parts.writes.applyWritesTool.needsApproval).toBe(true);
  });
});

describe("GATE-004 a read validates its input on the host", () => {
  it("a program reads the validation message of a bad input", async () => {
    const run = await runProgram(BAD_INPUT_PROGRAM);

    expect(run.error).toBeNull();
    expect(run.result).toEqual({ rejected: true, message: "getPullRequest: 'number' must be a positive integer" });
  });
});
