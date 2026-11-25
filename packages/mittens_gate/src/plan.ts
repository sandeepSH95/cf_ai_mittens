/**
 * Write plans: the only way a change reaches GitHub.
 *
 *   program (isolate)  returns { plan: { writes: [...] } }      never executes a write
 *   model              calls apply_writes({ plan })              needsApproval: true
 *   human              clicks Approve in the UI
 *   host (this file)   validatePlan -> applyPlan(driver, ...)    GitHubDriver write methods
 */
import { z } from "zod";
import { WriteKind, type GitHubDriver, type RepoRef, type WriteReceipt } from "./github-types";

/** Upper bounds so one approval cannot fan out into hundreds of writes. */
export const MAX_WRITES_PER_PLAN = 25;
export const MAX_COMMENT_LENGTH = 4000;

const itemNumberSchema = z.number().int().positive();

export const WriteOpSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal(WriteKind.Comment), number: itemNumberSchema, body: z.string().min(1).max(MAX_COMMENT_LENGTH) }),
  z.object({ kind: z.literal(WriteKind.ClosePullRequest), number: itemNumberSchema }),
  z.object({ kind: z.literal(WriteKind.CloseIssue), number: itemNumberSchema })
]);

export const WritePlanSchema = z.object({
  writes: z.array(WriteOpSchema).min(1).max(MAX_WRITES_PER_PLAN)
});

export type WriteOp = z.infer<typeof WriteOpSchema>;
export type WritePlan = z.infer<typeof WritePlanSchema>;

export type FailedWrite = { op: WriteOp; error: string };
export type ApplyOutcome = { applied: WriteReceipt[]; failed: FailedWrite[] };
export type PlanApplier = (plan: WritePlan) => Promise<ApplyOutcome>;

/** The TypeScript the model reads for the plan shape. Keep in step with WriteOpSchema. */
export const PLAN_SPEC = `type WriteOp =
  | { kind: "${WriteKind.Comment}"; number: number; body: string }
  | { kind: "${WriteKind.ClosePullRequest}"; number: number }
  | { kind: "${WriteKind.CloseIssue}"; number: number };
type WritePlan = { writes: WriteOp[] }; // at most ${MAX_WRITES_PER_PLAN} writes, comment body at most ${MAX_COMMENT_LENGTH} characters`;

/** Throws a ZodError with a readable message when the plan is not valid. */
export function validatePlan(input: unknown): WritePlan {
  return WritePlanSchema.parse(input);
}

/** Runs the writes in order. One failure does not stop the rest; it is reported. */
export async function applyPlan(driver: GitHubDriver, repo: RepoRef, plan: WritePlan): Promise<ApplyOutcome> {
  const outcome: ApplyOutcome = { applied: [], failed: [] };

  for (const op of plan.writes) {
    try {
      outcome.applied.push(await applyOne(driver, repo, op));
    } catch (error) {
      outcome.failed.push({ op, error: error instanceof Error ? error.message : String(error) });
    }
  }

  return outcome;
}

function applyOne(driver: GitHubDriver, repo: RepoRef, op: WriteOp): Promise<WriteReceipt> {
  if (op.kind === WriteKind.Comment) {
    return driver.createComment(repo, op.number, op.body);
  }

  if (op.kind === WriteKind.ClosePullRequest) {
    return driver.closePullRequest(repo, op.number);
  }

  return driver.closeIssue(repo, op.number);
}
