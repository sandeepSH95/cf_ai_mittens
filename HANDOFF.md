# HANDOFF

Pass of 2026-11-26 (second). Verifier: exit 1 -> 1, cases 19/39 -> 26/39 (G-039 skipped).

## What changed

- `mittens_gate/src/reads.ts`: `defineReads(map, options?)` returns `{ facade, spec }`. Each entry is `{ input: { schema, declaration }, output: { declaration }, handler }`. The key check of all entries runs first, then the value checks. `facade.<method>(raw)` parses on the host, then calls the handler. A bad input rejects with `<method>: '<field>' <message>`.
- `mittens_gate/src/writes.ts`: `defineWrites(kinds, limits)` returns `{ planSpec, validatePlan, applyWritesTool }`. `validatePlan` throws a `PlanRefusal` ("Plan refused: ..."). The tool has `needsApproval: true` and calls `validatePlan` in `execute`, before any write.
- `facade.ts` and `plan.ts` now only name the GitHub reads and writes: `githubReads(driver, repo)`, `githubWrites(driver, repo)`. The `Facade` class, `spec()`, `PLAN_SPEC`, `applyPlan` and the zod plan schemas are gone.
- `createAgentTools({ executor, reads, writes })` takes the two results. The apply tool is `writes.applyWritesTool`.
- Demo: `services/turn.ts` has `createGateParts(env, executor)`. `prepareTurn` and `agentParts()` both call it. The agent reads its step limit from the turn.

## Fixed

G-013 to G-017, G-022, G-023.

## Still fails (12)

G-024, G-028 to G-038: `mittens_demo/testing` has no `runScriptedCase(input)`.

## Suggested order for the next pass

1. A scripted model driver from `input.script` (`scriptedModel` in `drivers/model.ts` exists). The `apply_writes` step takes the plan of the last program result.
2. A stub that counts read calls and records writes, shared between the gate (reads) and the apply tool (writes). Today each call of `createGitHubDriver` makes a new stub, and `createWrites(env)` takes no fixture source.
3. Drive the real `CoderAgent` by name, answer the approval, then build the report.

## Suspicions and notes

- `refusal`: the plan is validated in `execute`, so the human approves first and the refusal comes back as a tool error. Texts are ready: "Plan refused: 26 writes, the limit is 25" and "Plan refused: a comment has 4001 characters, the limit is 4000". The report must take the message from the agent path (the tool error part), not compute it.
- The tool's input schema is `{ plan: unknown }`. The model sees the plan shape only in the description of the `code` tool. A stricter schema makes the SDK refuse a bad plan with its own text, before `validatePlan`.
- An empty plan (`writes: []`) is now valid and applies nothing. The old schema refused it. GATE-003 does not list it.
- The comment limit applies to any write with a string `body`, not only to the kind `comment`.
- `defineWrites` takes `limits` as a second argument. The contract does not fix this and the adapter never calls it.
- The read validation message crosses RPC unchanged in the test runtime (demo test `agent-parts.test.ts`). Not checked in production.
- Still open from the last pass: no sandbox logs, the limit floors, the weak attack judgement.
- The fence hook refuses a shell command that names a fenced path, also for a read. Use the file tools to read cases and criteria.
- `npm test` prints "uncaught exception" for the rejected direct write and for the bad read input. Both are expected, the tests pass.
