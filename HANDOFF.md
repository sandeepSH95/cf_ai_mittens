# HANDOFF

Pass of 2026-11-26 (third). Verifier: exit 1 -> 0, cases 26/39 -> 38/39 (G-039 skipped, 0 fail).

## What changed

This pass started on uncommitted work of a stopped pass (37/39, only G-029 failed). The commit holds both.

- `mittens_demo/testing`: `runScriptedCase(input)` runs one turn of the real `CoderAgent` and builds the report from what the agent left: chat messages, the ledger route, the stub, the model's last prompt.
- `drivers/agent-client.ts`: a WebSocket client that speaks the page's chat protocol (message, approval answer, `get-messages`, `ledger`).
- `drivers/model.ts`: `ScriptedModelDriver` plays one script step per model call. `apply_writes` takes the plan of the last `code` result in the prompt.
- `drivers/github-stub.ts`: counts read calls, records writes, takes `now: null` as the real clock.
- `services/seam.ts`: `replaceDrivers(scope, { github, model })`. The scope is the agent name. The gate, the apply tool and the turn ask with the same scope, so they share one stub.
- `services/denial.ts` (this pass, G-029): `deniedAsResponded(messages)`. The agent calls it before `convertToModelMessages`.

## Why G-029 failed

`@cloudflare/ai-chat` stores a rejected call as `output-denied`. The AI SDK (7.0.181) turns that state into a tool result `error-text`. It gives `execution-denied` only for `approval-responded` with `approved: false`. The prompt now shows a denied part in that state. The stored chat is not changed, so the page still shows `output-denied`.

## Fixed

G-024, G-028 to G-038.

## Still fails

None. G-039 (live model) is skipped by the verifier.

## Suspicions and notes

- `deniedAsResponded` depends on SDK internals. A change of `ai` or `agents` can break it. The demo test "writes nothing after a reject" and G-029 catch that.
- The model sees a fixed denial. A reason typed by the human is not passed on (the page sends none today).
- The seam is a module-level map in production code. It works because the test and the Durable Object share one isolate in the test runtime. No path sets a replacement outside `testing.ts`.
- `runScriptedCase` answers one approval per turn. A script with two `apply_writes` steps leaves the second one pending.
- `refusal` comes from the tool error part after the human approved. So a human approves a plan that validation then refuses. A check before the approval request is better for the human.
- Still open from earlier passes: no sandbox logs, the limit floors, the weak attack judgement, an empty plan is valid, the comment limit applies to any write with a `body`.
- The fence hook refuses a shell command that names a fenced path, also for a read. Use the file tools.
- `npm test` prints "uncaught exception" for the rejected direct write and the bad read input. Both are expected: 42 tests pass.
- Next: the reviewer agent on the diff, then the held-out run. A human starts both.
