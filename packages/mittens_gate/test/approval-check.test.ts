/**
 * The approval check of the tool the model gets (GATE-002, GATE-003).
 *
 *   validatePlan passes            --> ask the human
 *   validatePlan throws PlanRefusal --> do not ask; execute throws the same refusal
 *   validatePlan throws anything else --> the error surfaces. It is never read as "no approval needed".
 *
 * The check is a safety check, so it must fail closed: an error it does not
 * know must not open a path to a write with no question.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { Executor } from "@cloudflare/codemode";
import { createAgentTools, defineWrites, ToolName } from "../src/index";

const MAX_WRITES = 2;
const MAX_COMMENT_LENGTH = 10;
const VALID_PLAN = { writes: [{ kind: "note", id: 1, body: "ok" }] };
const TOO_MANY = { writes: [VALID_PLAN.writes[0], VALID_PLAN.writes[0], VALID_PLAN.writes[0]] };
const BROKEN_VALIDATOR = "the validator itself is broken";

// The code tool is not under test. It only needs an executor to exist.
const UNUSED_EXECUTOR = { execute: async () => ({ result: null }) } as unknown as Executor;

function writes() {
  return defineWrites(
    {
      note: {
        input: { schema: z.object({ id: z.number(), body: z.string() }), declaration: "{ kind: \"note\"; id: number; body: string }" },
        apply: async () => undefined
      }
    },
    { maxWrites: MAX_WRITES, maxCommentLength: MAX_COMMENT_LENGTH }
  );
}

/** Asks the tool the model gets if a plan needs the human. */
function needsApproval(parts: ReturnType<typeof writes>, plan: unknown): unknown {
  const tools = createAgentTools({ executor: UNUSED_EXECUTOR, reads: { spec: () => "" }, writes: parts });
  const check = tools[ToolName.ApplyWrites]?.needsApproval;

  if (typeof check !== "function") {
    throw new Error("the model's apply tool has no approval check");
  }

  return check({ plan }, { toolCallId: "test-call", messages: [], context: undefined } as never);
}

describe("the approval check of the model's tool", () => {
  it("asks the human for a valid plan", async () => {
    expect(await needsApproval(writes(), VALID_PLAN)).toBe(true);
  });

  it("does not ask the human for a refused plan", async () => {
    expect(await needsApproval(writes(), TOO_MANY)).toBe(false);
  });

  it("does not read an unknown error as 'no approval needed'", async () => {
    const broken = {
      ...writes(),
      validatePlan: () => {
        throw new TypeError(BROKEN_VALIDATOR);
      }
    };

    await expect(async () => needsApproval(broken, VALID_PLAN)).rejects.toThrow(BROKEN_VALIDATOR);
  });
});
