# Brief: step S4 gold case drafts

Issued 25 November 2026 by the coordinator agent (Claude Code, claude-fable-5-1) to a builder subagent. Saved here because every prompt that produced part of this repository is on the record. The author's own prompt that started batch A is in `prompts/log.md`.

## Where you are

Repository root: `<repo>`. Work only there. Do not run `git commit`, `git add` or `git push`; the coordinator commits. Do not create or change anything under `criteria/`, `gold/cases/`, `gold/MANIFEST.sha256`, `verify/`, `loop/` or `docs/`. You create files only under `fixtures/` and `gold/drafts/`.

The project: Mittens, a chat agent where a model writes one JavaScript program against a read-only GitHub facade, the program runs in a Dynamic Worker sandbox with no network and no token, reads cross to a host gate over RPC, and writes come back as a plan a human approves. The real packages (`mittens_sandbox`, `mittens_gate`, `mittens_attack`, the demo app) do not exist yet. Their behaviour is defined by `criteria/*.md`, and their exact strings come from the 18 November prototype, which you read but never modify: `<workspace>/cf_ai_keyless_codemode/`.

Read first, in this order:

1. `docs/PLAN.md` sections 2 (glossary), 7 (criteria scheme), 8 (gold case shape) and the step S4 section.
2. All five files in `criteria/`. Every MUST criterion needs at least one case of its own proved-by kind; the proved-by column sketches the case you must write.
3. `verify/lint-case.ts`. It is the oracle for the case shape. Every draft you write must pass `node verify/lint-case.ts gold/drafts/<file>.json` with exit 0. Read `verify/lint-criteria.ts` for the kind names.
4. `docs/example-case.json`.
5. In the prototype: `src/drivers/sandbox.ts` (the exact error messages `BUDGET_ERROR_MESSAGE`, `TIMEOUT_ERROR_MESSAGE`, the binding name `GH`, the namespace `github`), `src/services/facade.ts` (the facade methods, `FACADE_TYPES`, `EXAMPLE_PROGRAM`), `src/services/plan.ts` (`MAX_WRITES_PER_PLAN`, `MAX_COMMENT_LENGTH`, `PLAN_SPEC`, the write kinds), `src/services/ledger.ts` (`MAX_RESULT_CHARS`), `src/drivers/github-stub.ts` and `test/fixtures/github.json` (the fixture shape the stub loads), `test/exfiltration.test.ts` (the malicious programs and the exact strings asserted), `test/approval-gate.test.ts`, `test/ledger.test.ts`.

## What you produce

### Fixtures, under `fixtures/`

Same JSON shape as the prototype's `test/fixtures/github.json`, so the stub driver can load them unchanged.

- `fixtures/repo-small.json`: 7 open pull requests, of which 2 are drafts and 5 are stale as of 2026-11-01 (no update for more than 30 days before that date); comments on 3 of them; 2 closed pull requests; 3 issues (2 open, 1 closed). Make the numbers, titles, authors and dates distinct and easy to check by eye.
- `fixtures/repo-empty.json`: the repository with no pull requests and no issues.
- `fixtures/repo-paged.json`: 101 open pull requests with no comments, numbered 1 to 101, so a list call that stops at 100 items is observable. Generate it with a script and keep the script as `fixtures/make-paged.mjs`.

### Programs, under `fixtures/programs/`

Plain JavaScript, each an async arrow function as the prototype's `normalizeCode` expects. Programs used in exact cases must be deterministic: no `Date.now()`, no randomness. The stale program takes its "as of" date as a literal, which the user message states.

- `stale-prs.js`: the prototype's `EXAMPLE_PROGRAM` with the as-of date 2026-11-01 as a literal instead of `Date.now()`.
- `stale-prs-no-plan.js`: the same but returns the summary only, no plan.
- `plan-26-writes.js`: returns a plan with 26 comment writes (GATE-003).
- `plan-long-comment.js`: returns a plan with one comment of 4,001 characters (GATE-003).
- `read-bad-input.js`: calls `github.getPullRequest({ number: "101" })`, a string where a number is required (GATE-004), catches the error and returns its message.
- `seven-reads.js`: makes exactly 7 gate reads and returns their count (SBX-005).
- `no-reads.js`: returns a constant without calling the gate (SBX-005).
- The eight attack programs, one file each, named as ATK-002 lists them: `attack-network-fetch.js`, `attack-swallowed-fetch.js`, `attack-env-inspection.js`, `attack-direct-write.js`, `attack-sync-loop.js`, `attack-async-loop.js`, `attack-recursion.js`, `attack-never-resolves.js`. Take their bodies from the prototype's exfiltration test.

### Gold drafts, under `gold/drafts/`

Ids `G-001` upward for the visible set, `G-901` upward for the held-out set. Twenty to forty visible, eight to twelve held-out. Every MUST criterion covered by at least one case of its proved-by kind. Write the held-out cases in the same shapes, varying the fixture or the numbers, so that a build which special-cases the visible inputs fails them.

Order of work, one family at a time, linting after each file:

1. Adversarial cases first (SBX-001, SBX-002, SBX-003, GATE-001, ATK-003). `input` is `{ "program": "fixtures/programs/<file>.js", "options": { "tickBudget": 10000 } }` when the criterion names a budget, and `expected` holds exactly `error` and `result`. The error strings are the exact constants from the prototype; the network error is the exact text the exfiltration test asserts. For SBX-002 the result is the object the program returns, with `envKeys` equal to `["GH"]` and `tokenType` equal to `"undefined"`; keep the program's returned object small and fully specified.
2. Contract cases (SBX-004, GATE-005, GATE-006, ATK-001, ATK-002, APP-004, APP-005, HARN-001, HARN-002, HARN-003). `input.call` is one of these registry names, which the verifier's adapter implements: `sandbox.createSandbox.keys`, `sandbox.createSandbox.badOption`, `gate.defineReads.spec`, `gate.defineReads.missingInput`, `gate.defineWrites.keys`, `gate.defineWrites.planSpec`, `gate.defineWrites.needsApproval`, `attack.report.keys`, `attack.case.keys`, `attack.missingExecute`, `attack.names`, `app.toolNames`, `app.stepLimit`, `app.stateAfterStaleFlow`, `harness.noCases`, `harness.fenceByte`, `harness.recordLine`. Optional `input.args` as an object. `expected` is the exact JSON value the call returns. Where the criteria define the value (the eight attack names, the key lists), use it. Where a string is not yet defined anywhere (a `TypeError` message, the declaration text of a facade defined with `defineReads`), propose the exact string, use it in the case, and list it in the sheet under "decisions needed" so the human can accept or change it before the case is signed.
3. Exact cases (SBX-005, GATE-002, GATE-003, GATE-004, APP-001, APP-002, APP-003). `input` has `user_message`, `fixtures` (a path under `fixtures/`), `model_script` (the steps the scripted model plays, in order), `approval` (`approve` or `reject`) and, when the flow depends on a date, `now` as an ISO string. `expected` uses only these keys, each of which the adapter reports: `program_result` (deep equal), `plan` (deep equal, or null when none), `ledger` (an object with `facade_calls`, `round_trips`, `error`, and `isolate_start_ms` as a `{ "min", "max" }` range or null), `apply_outcome` (`{ "applied", "failed" }` or null when `apply_writes` never ran or was rejected), `stub_writes` (the list of writes the stub received, each `{ "kind", "number" }` plus `body` for comments; `[]` when none), `refusal` (the exact string when a plan is refused, otherwise omit), `model_received` (`"execution-denied"` for the rejected flow, otherwise omit), `driver_calls` (an integer, only for GATE-004). Include every key whose value the case is about; omit keys the case does not test.
4. Invariant case for APP-006: `kind` `invariant`, `runs` 5, `expected` a list of predicate names: `parses`, `reads_only`, `plan_within_limits`, `no_breach`.
5. Held-out cases last, `G-901` upward, in a separate folder `gold/drafts/holdout/` so the human can move the folder out of the repository in one step.

### The verification sheet, `gold/drafts/VERIFICATION.md`

One table, one row per case: id, kind, covers, fixture or program, every expected value, and the derivation in one or two sentences (how the value follows from the fixture or the prototype constant, with the file and line it comes from). After the table, a section "Decisions needed" listing every string or number you proposed because nothing defined it, with your proposal and the alternative. Then a section "How to check": the commands the human runs.

### The derivation script, `gold/drafts/derive.mjs`

Plain Node, no dependencies. For every exact case it loads the fixture, re-implements the program's logic in a few lines, and prints the expected values (the stale count, the summary string, the facade call count, the plan) so the human can compare the printout with the sheet. Deterministic, under 150 lines.

## Rules

- No em dashes anywhere. Use a comma, colon or parentheses.
- Constants over magic values in scripts; short functions; braces on every if.
- Short sentences in the sheet. No praise. State what you were unsure about.
- Every draft passes the linter. Run `for f in gold/drafts/*.json gold/drafts/holdout/*.json; do node verify/lint-case.ts "$f" || echo "FAIL $f"; done` and paste the result in your report.
- Run `node gold/drafts/derive.mjs` and paste its output in your report.
- Do not invent fixture shapes. Match the prototype's.

## Report, your last message

1. Files created, as a tree.
2. The linter output and the derivation output, verbatim.
3. A count: visible cases by kind, held-out cases by kind, criteria covered, MUST criteria still uncovered (should be none).
4. The "Decisions needed" list, copied from the sheet.
5. Anything you could not derive without running code, one line each.
