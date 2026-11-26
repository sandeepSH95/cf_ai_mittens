# HANDOFF

Pass of 2026-11-26. Verifier: exit 1 -> 1, cases 3/39 -> 19/39 (G-039 skipped).

## What changed

- `mittens_sandbox`: `createSandbox({ loader, gate, tickBudget?, timeoutMs?, cpuMs? })` returns `{ execute }` only. It throws a `TypeError` on an unknown key, a missing loader or gate, or a non-positive limit. `execute` resolves to exactly `{ result, error, facadeCalls, isolateStartMs }`; `result` is null on an error.
- The `methods` option is gone. Inside the isolate, `github` is a proxy that forwards every method name to `env.GH`. The gate alone decides which methods exist.
- `mittens_attack`: `attackSandbox({ execute, canary })` returns `{ cases, breached }` with the eight names of ATK-002. A case is breached when the canary is in any string the executor reports or throws.
- `mittens_demo`: new `src/testing.ts` with `openGate(source?)`. New `services/executor.ts` wraps the sandbox for the `code` tool and reports each run to the ledger. The stub driver takes an optional fixture text and clock through the gate props.

## Fixed

G-001 to G-012, G-018 to G-021.

## Still fails (19)

- G-013, G-014: `mittens_gate` has no `defineReads`.
- G-015, G-016, G-017: `mittens_gate` has no `defineWrites`.
- G-022, G-023: `mittens_demo/testing` has no `agentParts()`.
- G-024, G-028 to G-038: `mittens_demo/testing` has no `runScriptedCase(input)`.

## Suggested order for the next pass

1. `defineReads` and `defineWrites` in `mittens_gate`, from the existing `facade.ts` and `plan.ts`. Read the exact declaration strings in G-013 and G-016 first.
2. `agentParts()`: needs the agent to build its reads and writes through those two functions.
3. `runScriptedCase`: needs a scripted model driver, a stub that counts read calls and records writes, and the approval answer.

## Suspicions and notes

- The sandbox no longer returns logs (the contract names four keys). The `code` tool now gives the model an empty log list. Console output of a program is lost.
- The limits are still raised to a floor (timeout 500 ms, ticks 1000, cpu 10 ms). A held-out case with a smaller positive value gets the floor, not an error.
- The attack suite judges by the canary only. A fetch that succeeds with no canary in the answer is reported as held. ATK-003 asks for no more, but it is a weak suite.
- `openGate(source)` is covered by one demo test only, not by a gold case yet.
- The fence hook refused two shell commands of mine by mistake. Both wrote only under `apps/`, but their text held the words of a fenced path (a fixture file name in a comment, and the word "loop" in a test name). Nothing ran, no fenced file changed (the verifier did not exit 3). The hook matches words in a shell command, so write such files with the file tools.
- `npm test` prints "uncaught exception ... does not implement createComment". It is the rejected write of the direct write attack, and the tests pass.
