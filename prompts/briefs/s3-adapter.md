# Brief: the verifier's adapter

Issued 25 November 2026 by the coordinator agent (Claude Code, claude-fable-5-2) to a subagent. The adapter is inside the fence: it is written once, on the author's behalf, and the loop's builder never edits it.

## Where you are

Repository root: `<repo>`. You write only under `verify/runner/` and, for one test, `verify/checks.test.ts`. Do not change `packages/`, `apps/`, `criteria/`, `gold/`, `fixtures/`, `loop/`, `docs/`, `prompts/`. Do not read anything outside the repository root except the installed `node_modules`; in particular do not open `../mittens_holdout`. Do not run git commands that change state. Do not regenerate `gold/MANIFEST.sha256`; the coordinator signs after you finish, so `sh verify/run.sh` will exit 3 for you. To run the cases while you work, call the runner directly: `node node_modules/vitest/vitest.mjs run --config verify/runner/vitest.config.ts`.

Read first: `docs/PLAN.md` sections 2, 7, 8 and 11; all of `criteria/`; `gold/drafts/VERIFICATION.md` (the case table and "Decisions taken"); every file in `verify/` (especially `verify/runner/*`, `verify/normalise.ts`, `verify/lint-case.ts`); five or six cases of each kind in `gold/cases/`; then the code as it is today: `packages/*/src`, `apps/mittens_demo/src`, `apps/mittens_demo/test/support.ts`, `apps/mittens_demo/vitest.config.ts`, `apps/mittens_demo/wrangler.jsonc`.

## The problem

`verify/runner/adapter.ts` exports `runCase(goldCase, files): Promise<Json>`. Today it throws for every case. You make it run each case against the packages, inside workerd, and return the actual value that `cases.test.ts` compares with the case's `expected`.

The packages today are the moved prototype. The public APIs that `criteria/` describes (`createSandbox({ loader, gate, tickBudget, timeoutMs, cpuMs }).execute(program)`, `defineReads`, `defineWrites`, `attackSandbox({ execute, canary })`, and so on) mostly do not exist yet. A later build loop creates them, with the gold cases as its only measure. So the adapter is written against the criteria, not against today's code, and most cases will still fail when you finish. That is expected. What matters is how they fail.

## Requirements

1. The adapter is thin and has no knowledge of expected values. It never branches on a case id. It maps `kind`, `input` and (for contract cases) the registry name in `input.call` to calls on the packages.
2. It imports the packages by name (`mittens_sandbox`, `mittens_gate`, `mittens_attack`, `mittens_demo`), dynamically, so a missing export fails one case and not the whole run. A missing or wrong-shaped export fails the case with one precise line, for example `contract: mittens_sandbox must export createSandbox(options)`. No case may crash the runner; `sh verify/run.sh` must never exit 5 because of the packages.
3. Everything the packages must provide for the adapter to work is written down in one file, `verify/runner/CONTRACT.md`: each export, its signature, what it returns, which criteria it serves. This file is what the build loop reads. Keep it exact and short. Where the criteria define an API, use that API and nothing else. Where the adapter needs a seam the criteria do not define (for example, running the scripted chat flow of an exact case against a fixture with a fixed `now`, and reading back the ledger row, the plan, the apply outcome, the writes the stub received, the refusal, what the model received, and the driver call count), define the smallest testing entry you can, as an export of the demo app such as `mittens_demo/testing`, and document it in CONTRACT.md. State clearly in CONTRACT.md that this entry must run the real agent code path (the real sandbox, gate, plan validation and ledger), with only the model and the GitHub driver replaced by the scripted stub and the fixture.
4. Kinds:
   - adversarial: load `input.program` (text is in `files`), build the sandbox with `input.options` over a gate backed by a fixture, execute, return `{ error, result }` with `result` null when there is none. For the two ATK-003 cases, `input.options.suite` is `attackSandbox` and `input.options.executor` is `sandbox` or `leaky-env`; run the attack suite against the real sandbox or against a leaky executor that the adapter itself supplies, and return `{ error: null, result: { breached, breachedNames } }` in the shape the cases expect. Read the cases and the sheet for the exact shapes.
   - contract: a registry, a map from `input.call` to a small function. One entry per name used in `gold/cases/`. Key lists are returned sorted. A thrown error is returned as `{ throws: <error name>, message: <message> }`. The three `harness.*` calls concern the verifier and the loop scripts themselves and cannot run inside workerd; give them one honest implementation choice and document it (for example values computed in Node by `vitest.config.ts` and handed in through `provide`, or a clean failure `contract: harness calls run in step S5` if that is the only honest option today).
   - exact: call the testing entry with the fixture text, `now`, the user message, the model script (program texts resolved from `files`) and the approval answer; return what it reports. The runner already compares only the keys the case expects.
5. Environment: the cases must run with the bindings the demo has (Worker Loader, the Durable Object, the gate entrypoint from `ctx.exports`). Change `verify/runner/vitest.config.ts` as needed, reusing the demo's `wrangler.jsonc` and the canary token from `mittens_attack/canary` the way `apps/mittens_demo/vitest.config.ts` does. Keep `MITTENS_ROOT` and `GOLD_DIR` working, and keep the temporary-repository test in `verify/checks.test.ts` working (adjust what it asserts if the failure text changes; it must still prove the workerd pipeline end to end).
6. Coding rules: no em dashes; constants for meaningful values; early returns; braces on every if; function names under 30 characters; a short header comment with an ASCII sketch in each new file; no Node imports in files that load inside workerd.

## Done when

1. `npm run -s typecheck:verify` exits 0.
2. `npm run -s test:verify` passes.
3. `node node_modules/vitest/vitest.mjs run --config verify/runner/vitest.config.ts` completes: every non-invariant case is reported as passed or failed (none errors the file), and each failure message is either a diff or one `contract:` line.
4. `npm test` at the root still passes 30 tests (you changed nothing there).

## Report, your last message

1. Files changed or created.
2. Each check: command, last lines, exit code.
3. A table of the cases: id, pass or fail, and for a failure its first line. Then a count of failures by cause.
4. CONTRACT.md's list of exports, one line each.
5. Any case whose expected value looks wrong now that it ran for real (for example an error string the runtime words differently). Show the actual text. Do not change the case.
6. Anything you were unsure about.
