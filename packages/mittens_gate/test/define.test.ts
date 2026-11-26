/**
 * defineReads (GATE-004, GATE-005) and defineWrites (GATE-003, GATE-006)
 * with small maps of their own, so the rules are tested apart from GitHub.
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { defineReads, defineWrites, PlanRefusal } from "../src/index";

const MAX_WRITES = 2;
const MAX_COMMENT_LENGTH = 10;

function reads(calls: unknown[]) {
  return defineReads({
    getItem: {
      input: { schema: z.object({ id: z.number({ error: "must be a number" }) }), declaration: "input: { id: number }" },
      output: { declaration: "Item" },
      handler: async (input: { id: number }) => {
        calls.push(input);
        return { id: input.id };
      }
    },
    listItems: {
      input: { schema: z.object({}), declaration: null },
      output: { declaration: "Item[]" },
      handler: async () => []
    }
  });
}

function writes(applied: unknown[]) {
  const apply = async (op: unknown) => {
    applied.push(op);
    return op;
  };

  return defineWrites(
    {
      comment: { input: { schema: z.object({ number: z.number(), body: z.string() }), declaration: "number: number; body: string" }, apply },
      close: { input: { schema: z.object({ number: z.number({ error: "must be a number" }) }), declaration: "number: number" }, apply }
    },
    { maxWrites: MAX_WRITES, maxCommentLength: MAX_COMMENT_LENGTH }
  );
}

describe("defineReads", () => {
  it("returns exactly facade and spec", () => {
    expect(Object.keys(reads([])).sort()).toEqual(["facade", "spec"]);
  });

  it("writes one declaration line per method", () => {
    expect(reads([]).spec()).toBe("declare const github: {\n  getItem(input: { id: number }): Promise<Item>;\n  listItems(): Promise<Item[]>;\n};");
  });

  it("throws a TypeError for each missing key, before it looks at a value", () => {
    const entry = { input: {}, output: {}, handler: async () => null };

    for (const missing of ["input", "output", "handler"] as const) {
      const { [missing]: _removed, ...rest } = entry;
      const define = () => defineReads({ getRepo: rest } as never);

      expect(define).toThrow(TypeError);
      expect(define).toThrow(`defineReads: 'getRepo' is missing '${missing}'`);
    }
  });

  it("rejects a bad input and does not call the handler", async () => {
    const calls: unknown[] = [];

    await expect(reads(calls).facade.getItem({ id: "7" })).rejects.toThrow("getItem: 'id' must be a number");
    expect(calls).toHaveLength(0);
  });

  it("gives the handler the parsed input", async () => {
    const calls: unknown[] = [];

    expect(await reads(calls).facade.getItem({ id: 7, extra: true })).toEqual({ id: 7 });
    expect(calls).toEqual([{ id: 7 }]);
  });
});

describe("defineWrites", () => {
  it("returns exactly planSpec, validatePlan and applyWritesTool", () => {
    expect(Object.keys(writes([])).sort()).toEqual(["applyWritesTool", "planSpec", "validatePlan"]);
  });

  it("the tool carries needsApproval: true", () => {
    expect(writes([]).applyWritesTool.needsApproval).toBe(true);
  });

  it("writes one line per kind and names the limits", () => {
    expect(writes([]).planSpec()).toBe(
      'type WriteOp =\n  | { kind: "comment"; number: number; body: string }\n  | { kind: "close"; number: number };\ntype WritePlan = { writes: WriteOp[] }; // at most 2 writes, comment body at most 10 characters'
    );
  });

  it("accepts a plan at the limits", () => {
    const plan = { writes: [{ kind: "comment", number: 1, body: "x".repeat(MAX_COMMENT_LENGTH) }, { kind: "close", number: 2 }] };

    expect(writes([]).validatePlan(plan)).toEqual(plan);
  });

  it("refuses a plan over the write limit", () => {
    const plan = { writes: [{ kind: "close", number: 1 }, { kind: "close", number: 2 }, { kind: "close", number: 3 }] };

    expect(() => writes([]).validatePlan(plan)).toThrow(PlanRefusal);
    expect(() => writes([]).validatePlan(plan)).toThrow("Plan refused: 3 writes, the limit is 2");
  });

  it("refuses a comment over the length limit", () => {
    const plan = { writes: [{ kind: "comment", number: 1, body: "x".repeat(MAX_COMMENT_LENGTH + 1) }] };

    expect(() => writes([]).validatePlan(plan)).toThrow("Plan refused: a comment has 11 characters, the limit is 10");
  });

  it("refuses a kind that is not in the map, also a name from the prototype", () => {
    expect(() => writes([]).validatePlan({ writes: [{ kind: "merge", number: 1 }] })).toThrow("Plan refused: 'merge' is not a write kind");
    expect(() => writes([]).validatePlan({ writes: [{ kind: "constructor" }] })).toThrow(PlanRefusal);
  });

  it("refuses a write with a bad field and a value that is not a plan", () => {
    expect(() => writes([]).validatePlan({ writes: [{ kind: "close", number: "1" }] })).toThrow("Plan refused: close: 'number' must be a number");
    expect(() => writes([]).validatePlan(null)).toThrow(PlanRefusal);
  });

  it("the tool applies nothing when one write of the plan is refused", async () => {
    const applied: unknown[] = [];
    const execute = writes(applied).applyWritesTool.execute;
    const plan = { writes: [{ kind: "close", number: 1 }, { kind: "merge", number: 2 }] };

    await expect(async () => execute?.({ plan }, { toolCallId: "test-call", messages: [], context: undefined })).rejects.toThrow(PlanRefusal);
    expect(applied).toHaveLength(0);
  });

  it("the tool applies the writes in order", async () => {
    const applied: unknown[] = [];
    const execute = writes(applied).applyWritesTool.execute;
    const plan = { writes: [{ kind: "close", number: 1 }, { kind: "close", number: 2 }] };

    const outcome = await execute?.({ plan }, { toolCallId: "test-call", messages: [], context: undefined });

    expect(outcome).toEqual({ applied: plan.writes, failed: [] });
    expect(applied).toEqual(plan.writes);
  });
});
