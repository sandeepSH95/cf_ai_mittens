/**
 * The GitHub write plan: the only way a change reaches GitHub.
 *
 *   program (isolate)  returns { plan: { writes: [...] } }      never executes a write
 *   model              calls apply_writes({ plan })              needsApproval: true
 *   human              clicks Approve in the UI
 *   host (writes.ts)   validatePlan -> apply per write           GitHubDriver write methods
 *
 * This file names the three write kinds and their limits. defineWrites
 * (writes.ts) holds the mechanics.
 */
import { z } from "zod";
import { WriteKind, type GitHubDriver, type RepoRef } from "./github-types";
import { defineWrites, type Writes } from "./writes";

/** Upper bounds so one approval cannot fan out into hundreds of writes. */
export const MAX_WRITES_PER_PLAN = 25;
export const MAX_COMMENT_LENGTH = 4000;

const ITEM_NUMBER_MESSAGE = "must be a positive integer";
const BODY_MESSAGE = "must be a string that is not empty";

const itemNumberSchema = z.custom<number>((value) => Number.isInteger(value) && (value as number) > 0, { error: ITEM_NUMBER_MESSAGE });
const bodySchema = z.custom<string>((value) => typeof value === "string" && value.length > 0, { error: BODY_MESSAGE });

const CommentSchema = z.object({ number: itemNumberSchema, body: bodySchema });
const CloseSchema = z.object({ number: itemNumberSchema });

const CLOSE_FIELDS = "number: number";

export type WriteOp =
  | { kind: typeof WriteKind.Comment; number: number; body: string }
  | { kind: typeof WriteKind.ClosePullRequest; number: number }
  | { kind: typeof WriteKind.CloseIssue; number: number };
export type WritePlan = { writes: WriteOp[] };

export type GitHubWrites = Writes;

/**
 * The GitHub writes over one driver and one repository.
 * Example: githubWrites(driver, repo).validatePlan({ writes: [{ kind: "close_issue", number: 7 }] }).
 */
export function githubWrites(driver: GitHubDriver, repo: RepoRef): GitHubWrites {
  return defineWrites(
    {
      [WriteKind.Comment]: {
        input: { schema: CommentSchema, declaration: "number: number; body: string" },
        apply: (op: z.infer<typeof CommentSchema>) => driver.createComment(repo, op.number, op.body)
      },
      [WriteKind.ClosePullRequest]: {
        input: { schema: CloseSchema, declaration: CLOSE_FIELDS },
        apply: (op: z.infer<typeof CloseSchema>) => driver.closePullRequest(repo, op.number)
      },
      [WriteKind.CloseIssue]: {
        input: { schema: CloseSchema, declaration: CLOSE_FIELDS },
        apply: (op: z.infer<typeof CloseSchema>) => driver.closeIssue(repo, op.number)
      }
    },
    { maxWrites: MAX_WRITES_PER_PLAN, maxCommentLength: MAX_COMMENT_LENGTH }
  );
}
