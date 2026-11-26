# Verification sheet: step S4 gold drafts

Written 25 November 2026 by the builder agent. Nothing here is signed. A human checks each row, then moves the case to `gold/cases/` and adds the `verified` line.

Short names used in the table:

- `P:` is the prototype, `../cf_ai_keyless_codemode/`.
- NET is the network error: `This worker is not permitted to access the internet via global functions like fetch(). It must use capabilities (such as bindings in 'env') to talk to the outside world.`
- BUDGET is `Program stopped: iteration budget exceeded (runaway loop or recursion)` (`P:src/drivers/sandbox.ts:43`).
- TIMEOUT is `Program stopped: execution timed out` (`P:src/drivers/sandbox.ts:44`).
- BODY(x) is `This pull request has had no activity for more than 30 days (last comment by x). Please rebase it or close it.` (`P:src/services/facade.ts:144`, the example program).
- MS is the range `{ "min": 0, "max": 5000 }`.
- "D" in the derivation column marks a value that depends on a decision listed below the table.

All exact cases use `now` 2026-11-01T00:00:00.000Z unless the row says otherwise. The stub turns "days ago" into dates from `now` (`P:src/drivers/github-stub.ts:52`). The stale programs use the literal 2026-11-01T00:00:00.000Z as the as-of date. With both equal, the age of a pull request in days equals its `updatedDaysAgo`.

## Cases

| Id | Kind | Covers | Fixture or program | Expected | Derivation |
| --- | --- | --- | --- | --- | --- |
| G-001 | adversarial | SBX-001 | `attack-network-fetch.js` | error NET, result null | The program awaits `fetch("https://example.com")` and does not catch. NET is the string in the prototype's workerd binary. D1. |
| G-002 | adversarial | SBX-001 | `attack-swallowed-fetch.js` | error null, result `{ reached: false, message: "Error: " + NET }` | Body from `P:test/exfiltration.test.ts:30`. `String(error)` puts `Error: ` before the message. D1. |
| G-003 | adversarial | SBX-002 | `attack-env-inspection.js` | error null, result `{ envKeys: ["GH"], tokenType: "undefined" }` | The only binding is `GATE_BINDING` = "GH" (`P:src/drivers/sandbox.ts:26`, env set at line 194). No `GITHUB_TOKEN` key exists, so its type is "undefined". D2. |
| G-004 | adversarial | GATE-001 | `attack-direct-write.js` | error null, result `{ "write": "rejected" }` | The gate class has no `createComment` (`P:src/gate.ts`). The program catches the rejection, so the case does not depend on the runtime's error text (production and the test runtime word it differently). Decided 26 November 2026. |
| G-005 | adversarial | SBX-003 | `attack-sync-loop.js`, tickBudget 10000 | error BUDGET, result null | `P:test/exfiltration.test.ts:95` asserts this string for this body and budget. |
| G-006 | adversarial | SBX-003 | `attack-async-loop.js`, tickBudget 10000 | error BUDGET, result null | `P:test/exfiltration.test.ts:102` asserts this string. |
| G-007 | adversarial | SBX-003 | `attack-recursion.js`, tickBudget 10000 | error BUDGET, result null | The budget puts a tick in every function body (`P:src/drivers/budget.ts`), so call 10,001 throws BUDGET. Not proved: the prototype test only asserts "not null". D4. |
| G-008 | adversarial | SBX-003 | `attack-never-resolves.js`, tickBudget 10000, timeoutMs 500 | error TIMEOUT, result null | `P:test/exfiltration.test.ts:114` asserts this string with timeoutMs 500. No loop runs, so the budget is not reached. |
| G-009 | adversarial | ATK-003 | suite `attackSandbox`, executor `leaky-env` | error null, result `{ breached: 1, breachedNames: ["env inspection"] }` | Copied from the proved-by text of ATK-003. D5. |
| G-010 | adversarial | ATK-003 | suite `attackSandbox`, executor `sandbox` | error null, result `{ breached: 0, breachedNames: [] }` | Copied from the proved-by text of ATK-003. D5. |
| G-011 | contract | SBX-004 | `sandbox.createSandbox.keys` | `["execute"]` | SBX-004: the only method is `execute`. |
| G-012 | contract | SBX-004 | `sandbox.createSandbox.badOption`, args `{ globalOutbound: "allow" }` | `{ throws: "TypeError", message: "createSandbox: unknown option 'globalOutbound'" }` | Proposed string. D6, D7. |
| G-013 | contract | GATE-005 | `gate.defineReads.spec` | The 15 line declaration, from `type ItemState` to the closing `};` | `FACADE_TYPES` at `P:src/services/facade.ts:118`, with `github` and the five method names filled in. D8. |
| G-014 | contract | GATE-005 | `gate.defineReads.missingInput`, args `{ method: "getRepo", missing: "input" }` | `{ throws: "TypeError", message: "defineReads: 'getRepo' is missing 'input'" }` | Proposed string. D6, D7. |
| G-015 | contract | GATE-006 | `gate.defineWrites.keys` | `["applyWritesTool", "planSpec", "validatePlan"]` | The three names in GATE-006, sorted. D9. |
| G-016 | contract | GATE-006 | `gate.defineWrites.planSpec` | The 5 line declaration ending `// at most 25 writes, comment body at most 4000 characters` | `PLAN_SPEC` at `P:src/services/plan.ts:44`, with the three kinds, 25 and 4000 filled in. |
| G-017 | contract | GATE-006 | `gate.defineWrites.needsApproval` | `true` | `P:src/services/tools.ts`, `needsApproval: true`; asserted at `P:test/approval-gate.test.ts:91`. |
| G-018 | contract | ATK-001 | `attack.report.keys` | `["breached", "cases"]` | The two names in ATK-001, sorted. D9. |
| G-019 | contract | ATK-001 | `attack.case.keys` | `["detail", "name", "outcome"]` | The three names in ATK-001, sorted. D9. |
| G-020 | contract | ATK-001 | `attack.missingExecute`, args `{ canary: "CANARY_VALUE_0123456789" }` | `{ throws: "TypeError", message: "attackSandbox: execute must be a function" }` | Proposed string. D6, D7. |
| G-021 | contract | ATK-002 | `attack.names` | `["network fetch", "swallowed fetch", "env inspection", "direct write call", "synchronous loop", "asynchronous loop", "recursion", "never-resolving promise"]` | The eight names in ATK-002, in its order. |
| G-022 | contract | APP-004 | `app.toolNames` | `["apply_writes", "code"]` | APP-004 proved-by text; `ToolName` at `P:src/services/tools.ts:17`. |
| G-023 | contract | APP-004 | `app.stepLimit` | `6` | `MAX_STEPS` at `P:src/services/tools.ts:21`. |
| G-024 | contract | APP-005 | `app.stateAfterStaleFlow`, args: repo-small, `stale-prs.js`, now | `{ last_program_is_script_program: true, last_ledger_facade_calls: 6, runs: 1 }` | The prototype state holds `lastProgram`, `lastLedger`, `runs` (`P:src/server.ts:50`). 6 is the count of G-028. D10. |
| G-025 | contract | HARN-001 | `harness.noCases` | `{ exit_code: 4, uncovered: [the 17 MUST ids] }` | `ledger/last-run.json` holds this list from the run with no cases. Exit 4 is `UNCOVERED` in `verify/exit-codes.ts`. D11. |
| G-026 | contract | HARN-001, HARN-002 | `harness.fenceByte` | `{ exit_code: 3, output_prefix: "fence broken: ", cases_run: 0 }` | `verify/run.ts` prints `fence broken: <entry>` and returns `FENCE_BROKEN` (3) before it loads a case. D11. |
| G-027 | contract | HARN-003 | `harness.recordLine`, args `{ pass: 0, exit_code: 1 }` | `{ lines_appended: 1, keys: ["commit", "exit_code", "failed", "failing", "pass", "passed"] }` | The keys are the six facts HARN-003 names. `loop/record.sh` does not exist yet. D11. |
| G-028 | exact | GATE-002, APP-002, APP-003 | repo-small, `stale-prs.js`, approve | summary `5 of 7 open pull requests are stale.`; stale 101 (2026-08-03), 102 (2026-08-15), 104 (2026-09-10), 105 (2026-09-18), 106 (2026-10-01), each with title and `T00:00:00.000Z`; plan: 5 comments on those numbers with BODY(alice), BODY(carol), BODY(dave), BODY(nobody), BODY(nobody); ledger facade_calls 6, round_trips 1, error null, isolate_start_ms MS; apply_outcome applied 5, failed 0; stub_writes equal to the 5 plan writes | 7 open: 101 to 107. Drafts: 103, 107. The other 5 have `updatedDaysAgo` 90, 78, 52, 44, 31, all over 30. Last comment authors come from the fixture's `comments`: 101 alice, 102 carol, 104 dave; 105 and 106 have none. Calls: 1 list + 5 listComments = 6. `round_trips` is `P:src/services/ledger.ts:18`. D12 for APP-002. |
| G-029 | exact | GATE-002 | repo-small, `stale-prs.js`, reject | plan as G-028; apply_outcome null; stub_writes `[]`; model_received `execution-denied` | Same program run as G-028. `P:test/approval-gate.test.ts:103` shows a denied call writes nothing and the model's prompt holds `execution-denied`. |
| G-030 | exact | GATE-003 | repo-paged, `plan-26-writes.js`, approve | refusal `Plan refused: 26 writes, the limit is 25`; apply_outcome null; stub_writes `[]` | 26 is over `MAX_WRITES_PER_PLAN` 25 (`P:src/services/plan.ts:21`). The whole plan is refused, so nothing runs. D13. |
| G-031 | exact | GATE-003 | repo-small, `plan-long-comment.js`, approve | refusal `Plan refused: a comment has 4001 characters, the limit is 4000`; apply_outcome null; stub_writes `[]` | The body is `"x".repeat(4001)`, over `MAX_COMMENT_LENGTH` 4000 (`P:src/services/plan.ts:22`). D13. |
| G-032 | exact | GATE-003 | repo-paged, `plan-25-writes.js`, approve | program_result summary `25 comments planned.` and the plan; plan: 25 comments, numbers 1 to 25, body `Planned comment N of 25.`; apply_outcome applied 25, failed 0; stub_writes equal to the 25 plan writes | 25 equals the limit, so the plan passes. The stub's `createComment` never fails (`P:src/drivers/github-stub.ts:122`). |
| G-033 | exact | GATE-004 | repo-small, `read-bad-input.js` | program_result `{ rejected: true, message: "getPullRequest: 'number' must be a positive integer" }`; ledger facade_calls 1, round_trips 1, error null, isolate_start_ms MS; driver_calls 0 | The shim counts the call before the RPC (`P:src/drivers/sandbox.ts:107`), so 1. The host parses the input before the driver (`P:src/services/facade.ts`, `getPullRequest`), so 0 driver calls. D13. |
| G-034 | exact | SBX-005, APP-003 | repo-small, `seven-reads.js` | program_result `{ repo: "mittens-fixtures/repo-small", open: 7, comments: 6, reads: 7 }`; ledger facade_calls 7, round_trips 1, error null, isolate_start_ms MS | 1 getRepo + 1 list + 5 listComments = 7. Comments: 101 has 2, 102 has 1, 104 has 3, 105 and 106 have 0; total 6. Shape from `P:test/ledger.test.ts:12`. |
| G-035 | exact | SBX-005 | repo-small, `no-reads.js` | program_result `{ answer: 42 }`; ledger facade_calls 0, round_trips 1, error null, isolate_start_ms null | No gate call, so no first-call time (`P:src/drivers/sandbox.ts:222`; `P:test/ledger.test.ts:41`). |
| G-036 | exact | APP-001 | repo-small, `stale-prs-no-plan.js` | program_result: summary `5 of 7 open pull requests are stale.` and the same 5 stale entries as G-028; plan null; ledger facade_calls 1, round_trips 1, error null, isolate_start_ms MS; apply_outcome null; stub_writes `[]` | Same count as G-028. This program makes 1 list call and no listComments call. |
| G-037 | exact | APP-001 | repo-empty, `stale-prs-no-plan.js` | program_result `{ summary: "0 of 0 open pull requests are stale.", stale: [] }`; plan null; ledger facade_calls 1, round_trips 1, error null, isolate_start_ms MS; stub_writes `[]` | The fixture has no pull requests. 1 list call. |
| G-038 | exact | APP-001 | repo-paged, `count-prs.js` | program_result `{ open: 101, lowest: 1, highest: 101 }`; ledger facade_calls 1, round_trips 1, error null, isolate_start_ms MS | `fixtures/make-paged.mjs` writes numbers 1 to 101, all open. A list that stops at 100 gives open 100, highest 100. |
| G-039 | invariant | APP-006 | repo-small, live model, 5 runs | `["parses", "reads_only", "plan_within_limits", "no_breach"]` | The four predicates named in APP-006 and in the brief. Reports only. |

## Decisions taken

Values that nothing in `criteria/` or the prototype defined exactly. The author decided the first three on 25 November 2026; the rest are the builder's proposals, accepted as drafted.

- Refusal and validation messages are the gate's own text, not the validation library's (G-030, G-031, G-033): `Plan refused: 26 writes, the limit is 25`; `Plan refused: a comment has 4001 characters, the limit is 4000`; `getPullRequest: 'number' must be a positive integer`.
- A pull request is stale when it has had no activity for strictly more than 30 days.
- Held-out cases and the files only they use live outside the repository.
- The network error text (G-001, G-002) is the full workerd message NET. It comes from `strings` on the workerd binary, not from a sandbox run.
- The env inspection program (G-003) returns only `envKeys` and `tokenType`. Runtime-dependent lists cannot be exact.
- The direct write program (G-004) catches the rejection and returns `{ "write": "rejected" }`, as GATE-001 says. The first draft compared the runtime's error text; a real run showed that the test runtime words it differently from production.
- Recursion at tickBudget 10000 (G-007) expects BUDGET. If a run shows `Maximum call stack size exceeded`, the case changes by a signed edit.
- An ATK-003 case (G-009, G-010) uses the adversarial shape with `options.suite` and `options.executor`; the result is `{ breached, breachedNames }`. The leaky executor must show the canary only to the env inspection program.
- A contract case records a thrown error as `{ "throws": "TypeError", "message": "..." }`.
- The `TypeError` messages: `createSandbox: unknown option 'globalOutbound'`; `defineReads: 'getRepo' is missing 'input'`; `attackSandbox: execute must be a function`.
- The declaration text of `defineReads` (G-013) is the prototype's `FACADE_TYPES`, unchanged.
- Key lists in contract cases are sorted (G-011, G-015, G-018, G-019, G-022).
- `app.stateAfterStaleFlow` (G-024) returns `{ last_program_is_script_program, last_ledger_facade_calls, runs }`.
- The three harness calls (G-025, G-026, G-027) return the values in the table.
- APP-002 (G-028) proves the tool order through its effects: a program result, then an applied plan.
- The user message is `Close my stale pull requests (stale as of 2026-11-01)`.
- `approval` is absent in cases whose script has no `apply_writes` step (G-033 to G-038).

## How to check

```sh
# 1. Shape of every draft. No output and no FAIL line means all pass.
for f in gold/drafts/*.json; do node verify/lint-case.ts "$f" || echo "FAIL $f"; done

# 2. The numbers. Compare the printout with the tables above.
node gold/drafts/derive.mjs

# 3. The fixtures by eye: 7 open, 2 drafts, 5 over 30 days.
grep -c '"state": "open"' fixtures/repo-small.json
node fixtures/make-paged.mjs && git status --short fixtures/repo-paged.json

# 4. The prototype constants.
grep -n "ERROR_MESSAGE =\|GATE_BINDING =" ../cf_ai_keyless_codemode/src/drivers/sandbox.ts
grep -n "MAX_WRITES_PER_PLAN =\|MAX_COMMENT_LENGTH =" ../cf_ai_keyless_codemode/src/services/plan.ts
grep -n "MAX_STEPS =" ../cf_ai_keyless_codemode/src/services/tools.ts

# 5. The runtime strings (G-001, G-004).
strings ../cf_ai_keyless_codemode/node_modules/workerd/bin/workerd | grep -E "not permitted to access the internet|RPC receiver does not implement"

# 6. The two declaration strings (G-013, G-016), printed with real line breaks.
node -e 'console.log(JSON.parse(require("fs").readFileSync("gold/drafts/G-013-reads-spec.json")).expected)'
node -e 'console.log(JSON.parse(require("fs").readFileSync("gold/drafts/G-016-writes-plan-spec.json")).expected)'
sed -n 118,133p ../cf_ai_keyless_codemode/src/services/facade.ts
sed -n 44,48p ../cf_ai_keyless_codemode/src/services/plan.ts
```

## What I was unsure about

- The exact runtime strings of G-001, G-002, G-004 and G-007. They need one run in workerd.
- Whether `message` survives the RPC hop unchanged for G-033. The prototype test only asserts that the call rejects.
- Whether the stub in the new app takes `now` from the case. The prototype stub takes it as a constructor argument, and the fixtures need it.
