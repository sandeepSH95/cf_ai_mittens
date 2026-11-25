/**
 * Covers KCM-003 (writes require human approval).
 *
 * Runs the real tool set through the AI SDK with a scripted model, inside
 * workerd. No browser: the approval response is appended as the
 * tool-approval-response part the client would send.
 */
import type { Executor } from "@cloudflare/codemode";
import { stepCountIs, streamText, type ModelMessage } from "ai";
import { applyPlan, createAgentTools, MAX_STEPS, ToolName, type ApplyOutcome, type WritePlan } from "mittens_gate";
import { describe, expect, it } from "vitest";
import { parseRepoRef, WriteKind } from "../src/drivers/github";
import { StubGitHubDriver } from "../src/drivers/github-stub";
import { scriptedModel } from "../src/drivers/model";

const REPO = parseRepoRef("octocat/hello-world");
const USER_MESSAGE: ModelMessage = { role: "user", content: "Comment on 101 and close 102." };
const PLAN: WritePlan = {
  writes: [
    { kind: WriteKind.Comment, number: 101, body: "Stale for 90 days. Please rebase or close." },
    { kind: WriteKind.ClosePullRequest, number: 102 }
  ]
};
const APPROVAL_REQUEST = "tool-approval-request";
const EXECUTION_DENIED = "execution-denied";

/** The code tool is not exercised here. */
const NO_EXECUTOR: Executor = { execute: async () => ({ result: undefined, error: "not used in this test" }) };

function setup() {
  const driver = new StubGitHubDriver();
  const tools = createAgentTools({ executor: NO_EXECUTOR, applyPlan: (plan) => applyPlan(driver, REPO, plan) });
  return { driver, tools };
}

/** First turn: the model asks to apply the plan; the SDK must stop and ask a human. */
async function requestApproval(tools: ReturnType<typeof setup>["tools"]) {
  const result = streamText({
    model: scriptedModel([{ toolCall: { name: ToolName.ApplyWrites, input: { plan: PLAN } } }, { text: "done" }]),
    tools,
    messages: [USER_MESSAGE],
    stopWhen: stepCountIs(MAX_STEPS)
  });

  const steps = await result.steps;
  const requests = steps.flatMap((step) => step.content).filter((part) => part.type === APPROVAL_REQUEST);
  const responseMessages = (await result.response).messages;

  return { steps, requests, responseMessages };
}

/** Second turn: replay the transcript plus the human's answer. */
async function answerApproval(tools: ReturnType<typeof setup>["tools"], transcript: ModelMessage[], approvalId: string, approved: boolean) {
  const model = scriptedModel([{ text: "understood" }]);

  const result = streamText({
    model,
    tools,
    messages: [USER_MESSAGE, ...transcript, { role: "tool", content: [{ type: "tool-approval-response", approvalId, approved }] }],
    stopWhen: stepCountIs(MAX_STEPS)
  });

  await result.text;
  return { model, steps: await result.steps };
}

type PromptMessage = { role: string; content: unknown };
type ToolResultPart = { type: string; toolName: string; output: { type: string; value?: unknown } };

/** Finds the apply_writes tool result the SDK put into the prompt after an approved execution. */
function applyOutcomeInPrompt(prompt: readonly PromptMessage[]): ApplyOutcome | undefined {
  for (const message of prompt) {
    if (message.role !== "tool" || !Array.isArray(message.content)) {
      continue;
    }

    const part = (message.content as ToolResultPart[]).find((candidate) => candidate.type === "tool-result" && candidate.toolName === ToolName.ApplyWrites);

    if (part !== undefined && part.output.type === "json") {
      return part.output.value as ApplyOutcome;
    }
  }

  return undefined;
}

describe("KCM-003 writes require human approval", () => {
  it("apply_writes carries needsApproval: true", () => {
    const { tools } = setup();
    expect(tools[ToolName.ApplyWrites].needsApproval).toBe(true);
  });

  it("a call without approval stops the turn and executes nothing", async () => {
    const { driver, tools } = setup();
    const { steps, requests } = await requestApproval(tools);

    expect(requests).toHaveLength(1);
    expect(steps).toHaveLength(1);
    expect(driver.writes()).toHaveLength(0);
  });

  it("a denied call executes nothing and the model is told execution-denied", async () => {
    const { driver, tools } = setup();
    const { requests, responseMessages } = await requestApproval(tools);
    const approvalId = (requests[0] as { approvalId: string }).approvalId;

    const { model } = await answerApproval(tools, responseMessages, approvalId, false);

    expect(driver.writes()).toHaveLength(0);

    const prompt = JSON.stringify(model.doStreamCalls.at(-1)?.prompt);
    expect(prompt).toContain(EXECUTION_DENIED);
  });

  it("an approved call executes through the host-side driver", async () => {
    const { driver, tools } = setup();
    const { requests, responseMessages } = await requestApproval(tools);
    const approvalId = (requests[0] as { approvalId: string }).approvalId;

    const { model } = await answerApproval(tools, responseMessages, approvalId, true);

    const writes = driver.writes();
    expect(writes.map((write) => write.kind)).toEqual([WriteKind.Comment, WriteKind.ClosePullRequest]);
    expect((await driver.getPullRequest(REPO, 102)).state).toBe("closed");

    // The approved tool ran before the model was called again, so its result is in the model's prompt.
    const outcome = applyOutcomeInPrompt(model.doStreamCalls.at(-1)?.prompt ?? []);
    expect(outcome?.applied).toHaveLength(2);
    expect(outcome?.failed).toHaveLength(0);
  });
});
