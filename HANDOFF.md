# HANDOFF

Pass of 2026-11-26 (fifth). Verifier: exit 1 -> 0, cases 37/47 -> 46/47 (G-039 skipped, 0 fail). `npm test`: 65 pass.

## What changed

The nine cases of commit 0e5c90b (the review findings).

- GATE-003, approval order (G-028, G-030, G-031, G-040): `createAgentTools` in `mittens_gate/src/tools.ts` gives the model a copy of the approval tool. Its `needsApproval` runs `validatePlan`: a valid plan asks the human, a refused plan asks nobody and fails in `execute` with the same refusal. The tool of `defineWrites` still carries `needsApproval: true` (GATE-006). `testing.ts` reports `approval_asked` from the chat store.
- GATE-003, empty plan (G-042): `checkPlan` refuses a plan with no writes.
- ATK-003 (G-043, G-044): each attack program returns `escaped: true` when its forbidden action succeeded. The suite reports a breach for that, and for the canary in base64 at any of the three alignments.
- SBX-004 (G-046): a limit below its minimum throws. Before, `Math.max` raised it silently.
- APP-003 (G-047): new `services/gate-meter.ts`. `GitHubGate` reports each read to the agent over RPC (`CoderAgent.countGateCall`), and the executor takes the count and the first call time from that meter.

## Still fails

None. G-039 (live model) is skipped by the verifier.

## A human should decide

- `CoderAgent.countGateCall` is a new public method. Durable Object RPC needs it public. It is not `@callable`, so a browser cannot reach it. A module-level counter needs no public member, but it is wrong when the gate and the agent run in different isolates.
- Each read now costs one more RPC (gate to agent). A read whose count fails does not run.
- The runaway attacks are finite now, so they can report an escape: 100,000,000 loop turns or calls (50 times the default tick budget), and a 60 s wait for "never-resolving promise". Against an executor with no limits the suite takes long but ends. A sandbox built with a budget above 100,000,000 gets a false breach.
- The model's tool has a function for `needsApproval`. Safety depends on one fact: `needsApproval` and `execute` call the same `validatePlan`.

## Suspicions and notes

- The base64 check does not cover the URL-safe alphabet, hex, or a canary split over two strings.
- `escaped: true` is read at the top level of `result` only.
- `execute` of `mittens_sandbox` still counts in the isolate: `createSandbox` has no host entrypoint of its own. Only the ledger uses the host count. A gate handle with no `scope` (the tests in `test/support.ts`) is not metered.
- The meter is per agent, one turn at a time. A call from an older gate handle is ignored by its run id.
- A program can catch the budget error and return a result. It then ends with `error: null`. No attack covers this.
- Unpinned wordings remain a held-out risk: `option '<key>' is required`, `options must be an object`, the other `PlanRefusal` texts.
- The fence hook refused one shell read of `verify/runner/adapter.ts` in this pass. Nothing fenced was changed (verifier exit 0, not 3). Use the file tools for fenced paths.
- Next: the reviewer agent on the diff, then the held-out run. A human starts both.
