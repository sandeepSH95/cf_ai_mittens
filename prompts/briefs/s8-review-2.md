# Brief: step S8, second review

Issued 26 November 2026 by the coordinator agent (Claude Code, claude-fable-5-2) to a read-only reviewer subagent.

## Where you are

Repository root: `<repo>`.

You change no file. You run no command that writes. You do not read `../mittens_holdout`. You may run `git diff`, `git log` and `git show`.

## What to review

One commit by the headless build loop: `3ffa9a8`. Its base is `0e5c90b`, which added nine gold cases for the findings of the first review (`prompts/briefs/s8-review.md`). Read `git diff 0e5c90b 3ffa9a8 -- packages apps` and the full files where the diff is not enough. Read `HANDOFF.md`: the builder lists its own doubts there.

The gold set passes (46 of 47, one skipped). Your task is the same as before: find where the code meets a case and not the criterion. Follow `.claude/agents/reviewer.md` exactly.

Check each of these by reading the code, and confirm or reject it with a file and a line:

1. Approval order. The model's copy of the approval tool has a function for `needsApproval` that runs `validatePlan`. Can any path apply a plan that validation would refuse, or ask the human for a plan that is refused? Is the plan that `needsApproval` saw the same one `execute` applies?
2. `CoderAgent.countGateCall` is a new public method. Who can call it? Can a browser client, or the program in the isolate, call it to forge or inflate the count?
3. The gate meter. Can a read reach the driver with no count (for example a gate handle with no scope, or a failed count call)? Is the count per run, or can two turns mix?
4. The attack suite. Is `escaped: true` set only when the forbidden action truly succeeded, for each of the eight programs? Can the real sandbox give a false breach, or a broken executor give a false "held"?
5. A program that catches the budget error and returns a result ends with `error: null`. Is that a way to run past the tick budget?
6. Limits. Does every limit below its minimum throw, and is any value still changed with no error?
7. The findings of the first review that had no case: the test seam in the production bundle, test-only code in `drivers/model.ts`, `export *` in the package index files. State if each is unchanged.

## Report, your last message

The table from `.claude/agents/reviewer.md`, most severe first, then one line per item above: confirmed or rejected, with file and line. No praise. No summary of the code.
