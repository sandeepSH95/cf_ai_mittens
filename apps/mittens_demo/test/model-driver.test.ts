/**
 * The output limit of a model call.
 *
 * Workers AI ends an answer at 256 tokens when the caller names no limit.
 * A program plus its JSON wrapper is longer than that, so the tool call
 * arrived cut in the middle of a string and failed to parse. Seen in the
 * live-model check of 26 November 2026: 0 of 5 runs reached a plan.
 */
import { describe, expect, it } from "vitest";
import { createModelDriver, MAX_OUTPUT_TOKENS, ModelDriverKind } from "../src/drivers/model";

const WORKERS_AI_DEFAULT_TOKENS = 256;
const SCRIPT = { codeTool: "code", applyTool: "apply_writes", program: "async () => ({})" };

// The driver only stores the binding. No call leaves the test.
const UNUSED_BINDING = {} as Ai;

describe("the output limit of a model call", () => {
  it("is named by the live driver, and is far above the Workers AI default", () => {
    const driver = createModelDriver({ MODEL_DRIVER: ModelDriverKind.WorkersAi, AI: UNUSED_BINDING }, SCRIPT);

    expect(driver.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
    expect(MAX_OUTPUT_TOKENS).toBeGreaterThan(WORKERS_AI_DEFAULT_TOKENS * 8);
  });

  it("is the same for the stub driver, so both paths make the same call", () => {
    const driver = createModelDriver({}, SCRIPT);

    expect(driver.maxOutputTokens).toBe(MAX_OUTPUT_TOKENS);
  });
});
