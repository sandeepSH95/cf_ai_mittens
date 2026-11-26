/**
 * defineWrites: turns a map of write kinds into the plan declaration the
 * model reads, the plan validation and the approval tool.
 *
 *   program (isolate)   returns { plan: { writes: [...] } }     never executes a write
 *   model               calls apply_writes({ plan })             needsApproval: true
 *   human               approves or rejects the call
 *   host (this file)    validatePlan(plan) -> apply(op) per write, in order
 *
 * The tool runs on the host only. It is never given to the sandbox.
 */
import { tool, type Tool } from "ai";
import { z } from "zod";
import { issueText } from "./reads";

const REFUSAL_PREFIX = "Plan refused: ";
const WRITE_KEYS = ["input", "apply"] as const;

const APPLY_TOOL_DESCRIPTION = `Apply a write plan to GitHub. A human must approve this call before anything is written. Pass the plan a program returned.`;

/** `declaration` is the field text after the kind. Example: "number: number; body: string". */
export type WriteInput = { schema: z.ZodType; declaration: string };

export type WriteEntry = {
  input: WriteInput;
  // apply receives the parsed write. Its own signature states the type.
  apply: (op: any) => Promise<unknown>;
};

/** Upper bounds so one approval cannot fan out into hundreds of writes. */
export type WriteLimits = { maxWrites: number; maxCommentLength: number };

export type PlannedWrite = { kind: string } & Record<string, unknown>;
export type Plan = { writes: PlannedWrite[] };

export type FailedWrite = { op: PlannedWrite; error: string };
/** `applied` holds what each apply returned, in order. Example: a GitHub write receipt. */
export type ApplyOutcome = { applied: unknown[]; failed: FailedWrite[] };

export type Writes = {
  planSpec: () => string;
  validatePlan: (input: unknown) => Plan;
  applyWritesTool: Tool<{ plan: unknown }, ApplyOutcome>;
};

/** Thrown by validatePlan. The whole plan is refused; no write of it runs. */
export class PlanRefusal extends Error {
  constructor(reason: string) {
    super(`${REFUSAL_PREFIX}${reason}`);
    this.name = "PlanRefusal";
  }
}

export function defineWrites(kinds: Record<string, WriteEntry>, limits: WriteLimits): Writes {
  checkDefinition(kinds, limits);

  const validatePlan = (input: unknown): Plan => checkPlan(kinds, limits, input);

  const applyWritesTool = tool({
    description: APPLY_TOOL_DESCRIPTION,
    // The shape only. validatePlan holds the rules and runs on the host before any write.
    inputSchema: z.object({ plan: z.unknown() }),
    needsApproval: true,
    execute: async ({ plan }) => applyAll(kinds, validatePlan(plan))
  });

  const text = planText(kinds, limits);

  return { planSpec: () => text, validatePlan, applyWritesTool };
}

function checkDefinition(kinds: Record<string, WriteEntry>, limits: WriteLimits): void {
  for (const [kind, entry] of Object.entries(kinds)) {
    for (const key of WRITE_KEYS) {
      if (typeof entry !== "object" || entry === null || !(key in entry)) {
        throw new TypeError(`defineWrites: '${kind}' is missing '${key}'`);
      }
    }
  }

  for (const name of ["maxWrites", "maxCommentLength"] as const) {
    if (!Number.isInteger(limits?.[name]) || limits[name] <= 0) {
      throw new TypeError(`defineWrites: limits.${name} must be a positive integer`);
    }
  }
}

/**
 * Refuses the whole plan on the first rule it breaks.
 * Example: 26 writes with a limit of 25 throws "Plan refused: 26 writes, the limit is 25".
 */
function checkPlan(kinds: Record<string, WriteEntry>, limits: WriteLimits, input: unknown): Plan {
  const writes = (input as { writes?: unknown } | null)?.writes;

  if (!Array.isArray(writes)) {
    throw new PlanRefusal("a plan is { writes: [...] }");
  }

  if (writes.length > limits.maxWrites) {
    throw new PlanRefusal(`${writes.length} writes, the limit is ${limits.maxWrites}`);
  }

  return { writes: writes.map((write) => checkWrite(kinds, limits, write)) };
}

function checkWrite(kinds: Record<string, WriteEntry>, limits: WriteLimits, write: unknown): PlannedWrite {
  const kind = (write as { kind?: unknown } | null)?.kind;

  // Object.hasOwn: a kind such as "constructor" must not find a member of the prototype.
  if (typeof kind !== "string" || !Object.hasOwn(kinds, kind)) {
    throw new PlanRefusal(`write kind '${String(kind)}' is not allowed`);
  }

  const body = (write as { body?: unknown }).body;

  if (typeof body === "string" && body.length > limits.maxCommentLength) {
    throw new PlanRefusal(`a comment has ${body.length} characters, the limit is ${limits.maxCommentLength}`);
  }

  const parsed = kinds[kind].input.schema.safeParse(write);

  if (!parsed.success) {
    throw new PlanRefusal(`${kind}: ${issueText(parsed.error.issues[0])}`);
  }

  // The parsed value holds only the declared fields. The kind is put back last.
  return { ...(parsed.data as Record<string, unknown>), kind };
}

/** Runs the writes in order. One failure does not stop the rest; it is reported. */
async function applyAll(kinds: Record<string, WriteEntry>, plan: Plan): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { applied: [], failed: [] };

  for (const op of plan.writes) {
    try {
      outcome.applied.push(await kinds[op.kind].apply(op));
    } catch (error) {
      outcome.failed.push({ op, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return outcome;
}

/** Example line: `  | { kind: "comment"; number: number; body: string }`. */
function planText(kinds: Record<string, WriteEntry>, limits: WriteLimits): string {
  const ops = Object.entries(kinds).map(([kind, entry]) => `  | { kind: "${kind}"; ${entry.input.declaration} }`);

  return `type WriteOp =\n${ops.join("\n")};\ntype WritePlan = { writes: WriteOp[] }; // at most ${limits.maxWrites} writes, comment body at most ${limits.maxCommentLength} characters`;
}
