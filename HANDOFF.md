# HANDOFF

Pass of 2026-11-26 (fourth). Verifier: exit 1 -> 0, cases 38/41 -> 40/41 (G-039 skipped, 0 fail).

## What changed

Two error wordings. The criteria state them since commit 2fff9a6, after the first held-out run.

- `mittens_gate/src/writes.ts` (GATE-003, G-040): a kind outside the map now gives `Plan refused: write kind '<kind>' is not allowed`. Before: `'<kind>' is not a write kind`.
- `mittens_sandbox/src/sandbox.ts` (SBX-004, G-041): a non-positive number now gives `createSandbox: '<key>' must be a positive number`. Before, the text had the word `option` in front of the key.
- `mittens_gate/test/define.test.ts`: the unit test expects the new refusal.

No behaviour changed: the same inputs are refused, with the same error types.

## Fixed

G-040, G-041.

## Still fails

None. G-039 (live model) is skipped by the verifier.

## Suspicions and notes

- Wordings that no criterion states are still a held-out risk. Examples in `createSandbox`: `option '<key>' is required` and `options must be an object`. In the gate: the refusals for 26 writes and a long comment pass G-030 to G-032, the other `PlanRefusal` texts (bad plan shape, bad write input) are not pinned.
- `createSandbox` has two styles now: `unknown option '<key>'` and `option '<key>' is required` keep the word `option`, the positive number error does not. The criterion asks for this.
- `deniedAsResponded` depends on SDK internals. A change of `ai` or `agents` can break it. G-029 catches that.
- The seam is a module-level map in production code. No path sets a replacement outside `testing.ts`.
- `runScriptedCase` answers one approval per turn. A script with two `apply_writes` steps leaves the second one pending.
- `refusal` comes after the human approved. A check before the approval request is better for the human.
- Still open from earlier passes: no sandbox logs, the limit floors, the weak attack judgement, an empty plan is valid, the comment limit applies to any write with a `body`.
- The fence hook refuses a shell command that names a fenced path, also for a read. Use the file tools.
- `npm test` prints "uncaught exception" for the rejected direct write and the bad read input. Both are expected: 42 tests pass.
- Next: the reviewer agent on the diff, then the held-out run again. A human starts both.
