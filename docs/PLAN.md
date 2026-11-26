# PLAN.md: Mittens, the real build

Status: draft, 20 November 2026. Owner: the author. Read one step at a time: the first prompt of a session names the step, and that step's section is self-contained. The why lives in `docs/AGENTIC_LOOP_STRATEGY.md`; this file is the what and the how. Where step numbers here differ from the playbook's phase numbers, this file wins.

## 0. Read this first

The name: Mittens. The agent wears mittens: it can read everything, it cannot pick up the key, and it has to ask before it writes. Parts are `mittens_sandbox` (the room), `mittens_gate` (the hatch: reads up, results down, writes come back as a plan), `mittens_attack` (tries to pull the mittens off) and `mittens_harness` (builds the thing without marking its own work). The repository is `cf_ai_mittens`. The 18 November prototype keeps its old name, Keyless Code Mode, in the lineage file.

What this is: a monorepo with three packages (`mittens_sandbox`, `mittens_gate`, `mittens_attack`) and one demo app, built by an agent loop against a fenced gold set. The product claim: a model writes code against a GitHub repository and can never read the token, reach the network, or write without a human's approval.

The one rule: `criteria/`, `gold/` and `verify/` are fenced. A hook denies edits and a hash manifest catches what the hook misses. If a step seems to need a change there, stop and say so in your report. A human makes that change.

How this file is written, and why (sources in section 10):

1. It states what you cannot see from the code: goal, non-goals, boundaries, gotchas from the prototype. Anthropic's guidance is that this is the information worth writing down; the rest you can read from the repo.
2. Every step ends with a check that returns pass or fail with an exit code. "Done when" is something you can run, not something you judge.
3. Rules that cannot have exceptions are hooks, not sentences. A "do not" in a markdown file is not a deny; the hook is. This file tells you where each hook is so you know what will stop you.
4. Steps are small and one step is one session. A 2026 study of 1,650 Claude Code sessions found compliance falling about 5.6 percent per additional generated function within a session; a fresh session per step resets that.
5. Everything is specific: file paths, commands, expected output, criteria IDs. No adjectives. A study of 124 pull requests found repositories with an agent instruction file ran 28.6 percent faster with 16.6 percent fewer output tokens; a separate study found agent-generated instruction files made agents slightly worse. This file is human-written and dated.
6. The always-loaded file, `AGENTS.md`, stays under 200 lines (Cloudflare's reviewer penalises longer files and "tool names without runnable commands") and points here. This file is longer because it is read one step at a time.
7. It is kept current or deleted. Cloudflare's rule for its own repos: a stale agent file is worse than none.

## 1. Goal and non-goals

Goal: a chat agent on Cloudflare Workers where the model writes one JavaScript program per task against a typed, read-only GitHub facade; the program runs in a fresh Dynamic Worker with no network and no credential; reads cross to the host over RPC through a gate with no write methods; writes come back as a plan a human approves. Shipped as three reusable packages plus a demo app whose one feature is an attack you can run live. Built by a loop whose judge is a deterministic verifier the builder cannot edit.

Non-goals, for this build:

- No model other than through the driver interface. Workers AI by default; the AI SDK provider is swappable; no provider-specific code outside `packages/*/drivers`.
- No write kinds beyond comment, close pull request, close issue.
- No multi-repository support. `GITHUB_REPO` is fixed by the host.
- No policy engine for approvals. One human click per plan. The plan format makes a policy possible later; it is not built now.
- No competition with `@cloudflare/computer`. The sandbox package is the minimal, auditable executor; the attack package can test theirs too.
- No deploy, no `wrangler login`, no secrets in any file in the repository.

## 2. Glossary

| Term | Meaning here |
| --- | --- |
| criterion | one MUST or SHOULD statement with a stable ID, for example `SBX-003`, in `criteria/` |
| gold case | one JSON file in `gold/cases/`: an input and the exact output the system must produce, naming the criteria it covers |
| kind | exact (byte match after normalisation), adversarial (a malicious program and its exact outcome), contract (a public API shape), invariant (a predicate over live-model output; reports, never blocks) |
| verifier | `verify/`, one runner that checks the manifest, checks coverage, runs every gold case inside workerd, and exits 0, 1, 3, 4 or 5 (5: the verifier itself crashed) |
| fence | the folders the builder cannot edit: `criteria/`, `gold/`, `verify/`, `loop/`; enforced by a PreToolUse hook and `gold/MANIFEST.sha256` |
| pass | one headless agent session started by `loop/loop.sh`, followed by one verifier run and one ledger line |
| run | a sequence of passes until exit 0, a cap, or an exit of 3 or 4 |
| held-out | gold cases kept outside the repository in `../mittens_holdout/`, run by the human only |
| ledger | `ledger/iterations.jsonl`, one line per pass, written by `loop/record.sh`, never by the agent |
| the demo | `apps/mittens_demo`: the attack page, the chat agent, the GitHub driver and fixtures |

## 3. Layout

```
cf_ai_mittens/
├── AGENTS.md                       under 200 lines: commands, layout, boundaries; points here      human writes
├── CLAUDE.md                       one line: @AGENTS.md                                           human writes
├── docs/                           PLAN.md (this file), AGENTIC_LOOP_STRATEGY.md
├── criteria/                       sandbox.md gate.md attack.md demo.md harness.md                  fenced
├── gold/cases/*.json               gold cases                                                     fenced
├── gold/drafts/*.json              agent drafts awaiting human verification                       agent writes
├── gold/MANIFEST.sha256            hash of gold/cases and verify                                  fenced, human regenerates
├── verify/                         run.sh exit-codes.ts manifest.ts coverage.ts normalise.ts runner.test.ts lint-case.ts report.ts   fenced
├── loop/                           loop.sh PROMPT.md record.sh caps.env                           fenced
├── fixtures/                       repository snapshots as JSON; programs/*.js for scripted models  agent writes, human reviews
├── packages/mittens_sandbox/       the room: executor over the Worker Loader, shim, tick budget     agent writes
├── packages/mittens_gate/          the door list: defineReads, defineWrites, the approval tool      agent writes
├── packages/mittens_attack/        the harness: adversarial cases against any executor             agent writes
├── apps/mittens_demo/              the attack page, CoderAgent, GitHub driver                      agent writes
├── tools/mittens_harness/          README for the loop harness; extracted later                    human writes
├── ledger/                         iterations.jsonl, last-run.json, pass-N.json                    scripts write
├── prompts/log.md                  prompts the author published, verbatim, recorded by the agent  agent writes
├── prompts/00-prototype-lineage.md the 18 Nov 2026 prototype's briefs and build log                human writes
├── PROMPTS.md                      the curated history, written at the end                         human writes
├── HANDOFF.md                      what the last pass did and suspects; under 40 lines             agent writes
└── .claude/                        settings.json (hooks), rules/, agents/reviewer.md, skills/verify
../mittens_holdout/                 held-out cases, never committed
```

## 4. Boundaries

| Rule | Enforced by | What you see when it fires |
| --- | --- | --- |
| In a builder pass (`MITTENS_LOOP=1`, set by the loop): no Edit, Write or shell write under `criteria/`, `fixtures/`, `gold/cases/`, `gold/MANIFEST.sha256`, `verify/`, `loop/` or the hook files in `.claude/`, and no access to `../mittens_holdout` | PreToolUse hook `.claude/hooks/guard.ts`, exit 2, matches tool paths and Bash command text. An interactive session with the human is held by the manifest only | "fenced path: <path>. Stop and report." |
| No pass ends worse than it started | Stop hook `.claude/hooks/stop.ts` runs `sh verify/run.sh` in a builder pass; exit 2 when a case that passed at the start of the pass fails, or when the verifier exits 3 or 5. A pass may end red: the loop starts the next one | the regressed case ids and the verifier's last 40 lines |
| No credential in the prompt record | the agent refuses to record a prompt that contains a credential-shaped string and says so | "Not recorded: the prompt contains a credential shape." |
| No `wrangler secret`, `wrangler login`, `wrangler deploy` or `git push` from an agent, in every session | the same PreToolUse hook | "deploy and secrets are human steps", "git push is a human step" |
| Gold set and verifier unchanged since the human signed them | `verify/manifest.ts` before every run; exit 3 on mismatch | "fence broken: <file>" and no cases run |
| Every MUST has a case | `verify/coverage.ts`; exit 4 | "uncovered: SBX-004, GATE-002" |
| Commits carry the prompt or "by hand" | `.gitmessage` template; reviewed by the human, not enforced | n/a |

## 5. Commands

| Purpose | Command | Expected |
| --- | --- | --- |
| Install | `npm install` | no peer warnings |
| Types for Workers | `npm run types` (runs `wrangler types` in each workspace) | `worker-configuration.d.ts` regenerated, gitignored |
| Typecheck | `npm run typecheck` | exit 0 |
| Unit tests inside workerd | `npm test` | vitest, all workspaces |
| The verifier | `sh verify/run.sh` | exit 0, 1, 3, 4 or 5 (5 means the verifier crashed, not the build); one line per case; summary line; `ledger/last-run.json` |
| Lint one gold case | `node verify/lint-case.js gold/drafts/G-004.json` | exit 0, or the first schema error |
| Regenerate the manifest (human only) | `node verify/manifest.ts --print > gold/MANIFEST.sha256` | file rewritten |
| One loop run | `sh loop/loop.sh` | exits 0 (green), 1 (cap), 3, 4 or 5 (human); ledger lines appended |
| Record a pass by hand | `sh loop/record.sh <pass> <exit-code>` | one line appended to `ledger/iterations.jsonl` |
| Held-out run (human only) | `GOLD_DIR=../mittens_holdout sh verify/run.sh` | same output, flagged line in the ledger |
| Demo offline | `npm run dev -w apps/mittens_demo` | `wrangler dev --local` on a free port; stub drivers |

## 6. Steps

Each step: who runs it, what to read first, what to do, the check that says it is done, what to put in the final report, and where to stop. Start every step in a fresh session with the prompt "Read docs/PLAN.md step S<N> and do it."

### S0, by the agent: the record before anything

Done by the planning agent on 25 November 2026, after the author chose an agent-kept prompt record over a hook (the prompt is quoted in `prompts/00-prototype-lineage.md` section 0). Create `prompts/log.md` with its header, `.gitmessage` and `git config commit.template .gitmessage`, `LICENSE`, `.gitignore` (`node_modules`, `.wrangler`, `dist`, `.dev.vars`, `worker-configuration.d.ts`, `ledger/pass-*.json`), root `package.json` with `"workspaces": ["packages/*", "apps/*"]`, and `docs/` with the three documents. First commit: "Add the prompt record and the planning documents".

### S1, by the agent: lineage

Done in the same session as S0. Copy the prototype's `PROMPTS.md` and `specs/001-keyless/spec.md` into `prompts/00-prototype-lineage.md` with a provenance section: the prototype built 18 November 2026 in a separate research workspace by two agent instances, briefs quoted verbatim, research notes not published; the planning phase and its decisive prompts; the abandoned hook version of this repository. Commit: "Record the prototype's prompt lineage".

### S2, interactive: criteria

Read first: `docs/AGENTIC_LOOP_STRATEGY.md` sections "The gold set" and "The verifier"; `prompts/00-prototype-lineage.md`, the KCM-001 to KCM-010 table.

Do:

0. Record the prompt that started this step in `prompts/log.md` first: verbatim, under a heading with the UTC time, the session id prefix and HEAD. Do the same at the start of every later turn in which the author sends a prompt about the build. Do not record a prompt that contains a credential shape; say so instead.
1. Write five files in `criteria/`: `sandbox.md` (SBX), `gate.md` (GATE), `attack.md` (ATK), `demo.md` (APP), `harness.md` (HARN).
2. Each file is one table: `| ID | Level | Requirement | Proved by |`. Level is MUST or SHOULD. Requirement is one sentence in RFC 2119 wording. Proved by names one kind (exact, adversarial, contract, invariant) and sketches the case in one line.
3. Carry every KCM requirement forward under its new prefix and note the old ID in the requirement text. Add the public API of each package as contract criteria (what `createSandbox`, `defineReads`, `defineWrites`, `attackSandbox` accept and return).
4. Write no code. Write no gold cases.

Done when: `grep -hE '^\| [A-Z]{3,4}-[0-9]{3} ' criteria/*.md | wc -l` is between 15 and 25; every row has a level and a proved-by kind; no ID repeats (`grep -hoE '[A-Z]{3,4}-[0-9]{3}' criteria/*.md | sort | uniq -d` prints nothing).

Report: the ID list grouped by file with the proved-by kind; the criteria you were unsure about and why; any criterion you think cannot be proved deterministically.

Stop there. The human edits the files by hand and commits.

### S3, interactive: verifier skeleton, no cases yet

Read first: `docs/AGENTIC_LOOP_STRATEGY.md` section "The verifier and the iteration ledger"; `criteria/`; section 8 of this file.

Do:

1. `verify/exit-codes.ts`: constants `GREEN = 0`, `RED = 1`, `FENCE_BROKEN = 3`, `UNCOVERED = 4`, `CRASH = 5` (the verifier itself failed; never read as a failing build).
2. `verify/manifest.ts`: compare `gold/MANIFEST.sha256` to the files under `gold/cases/`, `verify/` and `loop/`; a missing manifest counts as broken.
3. `verify/coverage.ts`: parse `criteria/*.md`, list every MUST ID, list every `covers` ID across `gold/cases/*.json`, report MUST IDs with no exact, adversarial or contract case.
4. `verify/normalise.ts`: the rules in section 8, as pure functions with unit tests.
5. `verify/lint-case.ts`: validate one case file against the shape in section 8; exit 0 or print the first error.
6. `verify/runner.test.ts`: vitest inside workerd through `@cloudflare/vitest-plugin`; loads every case under the directory named by `GOLD_DIR` (default `gold/cases`); one test per case; prints `G-012 PASS SBX-002,SBX-003 (412 ms)` or a unified diff capped at 60 lines.
7. `verify/report.ts`: the summary line `cases N pass P fail F uncovered U` and `ledger/last-run.json`.
8. `verify/run.sh`: manifest, then coverage, then the runner, then the report; exits with the first non-zero code.

Done when: with no cases present, `sh verify/run.sh` exits 4 and prints every MUST ID as uncovered; `node verify/lint-case.js docs/example-case.json` exits 0 on the example in section 8; `npm run typecheck` exits 0.

Report: the files created; the verifier's output with no cases; the normalisation rules you implemented, one line each.

Stop there. Do not write cases. Do not write packages.

### S4, interactive: fixtures and gold cases

Read first: `criteria/`; `fixtures/README.md` if present; section 8 of this file.

Do, one family per prompt, in this order:

1. Fixtures: `fixtures/repo-small.json` (7 open pull requests, 2 drafts, 5 stale as of 2026-11-01, comments on 3), `fixtures/repo-empty.json`, `fixtures/repo-paged.json` (101 open items). Programs for scripted models in `fixtures/programs/`.
2. Adversarial cases first: one case per malicious program (network fetch, swallowed fetch, env inspection, direct write call on the gate, synchronous loop, async loop, recursion, never-resolving promise), each with the exact error string or the exact returned shape.
3. Contract cases: the facade declaration string the model reads, the plan declaration, each package's exported function names and their refusal of bad input.
4. Exact cases: the stale pull request flow with approve, with reject, with a plan over 25 writes refused, with a comment over 4,000 characters refused, with the empty fixture, with the paged fixture.
5. Write every case to `gold/drafts/`, never to `gold/cases/`. In your report, show how each expected value was derived from the fixture, step by step, so the human can check it.
6. Three extra cases per family in the same shape, marked `"holdout": true` in the draft name; the human moves those out of the repository.

Done when: every draft passes `node verify/lint-case.js`; every `covers` ID exists in `criteria/`; `gold/drafts/` holds 20 to 40 cases plus the held-out drafts.

Report: a table of case id, kind, covers, and the fixture; the derivation of every expected number; anything you could not derive without running code.

Stop there. The human verifies each case by hand, moves it into `gold/cases/`, adds `"verified": "by hand, <date>"`, moves the held-out drafts to `../mittens_holdout/`, regenerates the manifest, and commits.

### S5, interactive: fence and loop scaffolding

Read first: `docs/AGENTIC_LOOP_STRATEGY.md` sections "Loop mechanics" and "Cost, caps and stopping rules".

Do:

1. `.claude/hooks/guard.ts`: PreToolUse on the file tools and Bash. In a builder pass, exit 2 when the tool path is fenced, or when a Bash command names a fenced path and does more than read it. Reads, `sh verify/run.sh` and the linter stay allowed.
2. The same hook, in every session: exit 2 on `wrangler secret`, `wrangler login`, `wrangler deploy` and `git push`.
3. Stop hook `.claude/hooks/stop.ts`, builder passes only: `sh verify/run.sh`; exit 2 on a regression or on exit 3 or 5; print the last 40 lines to stderr.
4. `loop/loop.sh`, `loop/record.sh`, `loop/caps.env` (`MAX_PASSES=12`, `PLATEAU=3`, `MAX_MINUTES=120`, `PASS_MINUTES=30`), `loop/PROMPT.md` (the standing instruction in section 9 of this file).
5. `.github/workflows/ci.yml`: install, types, typecheck, `sh verify/run.sh`, manifest check; publish job on a tag with provenance.
6. `.claude/agents/reviewer.md`: tools Read, Grep, Glob only; reviews a diff against `criteria/` IDs.
7. `AGENTS.md` under 200 lines: commands from section 5, layout, boundaries, gotchas from section 11, and "read docs/PLAN.md for the current step". `CLAUDE.md` with the single line `@AGENTS.md`.

Done when: attempting to edit `gold/cases/` is refused and you paste the refusal in your report; `sh verify/run.sh` exits 1 (cases exist, packages empty), not 3 or 4; `sh loop/record.sh 0 1` appends one line to `ledger/iterations.jsonl`; `wc -l AGENTS.md` is under 200.

Report: the refusal text; the verifier summary line; the ledger line.

Stop there. The human regenerates the manifest (it now covers `loop/`) and commits. From here the fence is live.

### S6, interactive: move the prototype into packages

Read first: `prompts/00-prototype-lineage.md`; the prototype source the human has placed at `fixtures/prototype/` (read-only copy); `criteria/`.

Do:

1. Create `packages/mittens_sandbox`, `packages/mittens_gate`, `packages/mittens_attack`, `apps/mittens_demo`, each with `package.json` (`"type": "module"`, `exports`, `types`), `tsconfig.json` extending the root, `vitest.config.ts` with the Cloudflare plugin where the tests need workerd.
2. Move the prototype's code into the packages with no behaviour change: `drivers/sandbox.ts` and `drivers/budget.ts` to `packages/mittens_sandbox`; `services/facade.ts`, `services/plan.ts`, `services/tools.ts` to `packages/mittens_gate`; the exfiltration tests and canary to `packages/mittens_attack` as a reusable `attackSandbox()` helper plus the fixtures; the agent, gate, GitHub drivers, UI and remaining tests to `apps/mittens_demo`.
3. The demo imports the packages by name. No relative imports across workspace boundaries.
4. Keep the prototype's 30 tests; move each to the package that owns the code it tests.

Done when: `npm test` passes all moved tests inside workerd; `npm run typecheck` exits 0; `grep -rn "from \"\.\./\.\./packages" apps packages` prints nothing; `sh verify/run.sh` exits 1 or 0 and the summary line shows which cases already pass.

Report: the tree of the four workspaces; the test counts per workspace; the verifier summary; which gold cases pass before any new code.

Stop there. The human runs `sh loop/record.sh 0 <exit>` and commits.

### S7, headless: the loop

Human runs `sh loop/loop.sh`. Each pass is a fresh `claude -p` session with `loop/PROMPT.md`. The agent in a pass follows section 9 and nothing else. Between runs the human reads `ledger/iterations.jsonl` and the diffs, and either edits `loop/PROMPT.md` (its hash is in every ledger line) or opens an interactive session for one specific fix, which is captured like any other prompt.

Done when: `sh verify/run.sh` exits 0, or the run stops at a cap or at exit 3 or 4 and the human decides.

### S8, interactive: review and held-out

Read first: `criteria/`; the diff since the S6 commit.

Do:

1. Run the reviewer subagent over the diff against every criteria ID; collect findings with IDs.
2. For each finding: fix it, and if no gold case would have caught it, say so in the report (the human writes the case).
3. Do not run the held-out set; the human does, with `GOLD_DIR=../mittens_holdout sh verify/run.sh`, and records it.

Done when: the reviewer reports no finding above "style"; `sh verify/run.sh` exits 0.

Report: findings fixed, findings deferred with reasons, gold cases the human should add.

### S9, interactive: demo and README

Read first: `apps/mittens_demo`; the README requirements in the list below; `ledger/iterations.jsonl` for the plot.

Do:

1. The attack page: left pane, an editable pull request body pre-filled with an injection; right pane, the agent. Run shows the program, the ledger row, the plan, and a line "fetch attempts N, blocked; token reads 0; writes executed 0". Approve and Reject buttons.
2. README first page: the one-sentence claim, the ASCII architecture with the boundary line, the exfiltration test names as the runner prints them, a frame from the recording, one ledger row, the plot of pass count per pass from `ledger/iterations.jsonl`.
3. README lineage paragraph: Cloudflare's docs now recommend `@cloudflare/computer`'s codemode backend; this repo's executor is the minimal, auditable one and the attack package can test both.
4. Each package README: a usage example under 20 lines, written first.

Done when: `npm run dev -w apps/mittens_demo` serves the page and a curl to the agent route returns 200 with the stub drivers; `sh verify/run.sh` exits 0; every README has the usage example.

Report: the routes; the README outline; what the human must record (the 30 second demo).

### S10, by hand: curate and publish

Human only. Write `PROMPTS.md` from `prompts/log.md`. Tag, let CI publish the packages with provenance. Deploy on Workers Paid, put the URL at the top of the README, add Cloudflare Access in front of the chat route.

## 7. Criteria scheme

- Prefixes: `SBX` sandbox, `GATE` gate, `ATK` attack, `APP` demo, `HARN` harness. Three digits. IDs never change meaning; a retired ID is marked retired, not reused.
- Levels: MUST and SHOULD, RFC 2119. Only MUST criteria count for coverage.
- Every criterion has a proved-by line. If no deterministic case can prove it, it is SHOULD with kind invariant, or it is removed.

Example row:

```
| SBX-002 | MUST | The isolate's environment MUST contain exactly one binding, the gate handle, and MUST NOT contain the token (was KCM-002). | adversarial: a program lists env keys and the token type; expected keys ["GH"], type "undefined" |
```

## 8. Gold case shape

```json
{
  "id": "G-012",
  "covers": ["GATE-002", "APP-003"],
  "kind": "exact",
  "verified": "by hand, 2026-11-22",
  "input": {
    "user_message": "Close my stale pull requests",
    "fixtures": "fixtures/repo-small.json",
    "model_script": [
      { "tool": "code", "program": "fixtures/programs/stale-prs.js" },
      { "tool": "apply_writes" },
      { "text": "done" }
    ],
    "approval": "approve"
  },
  "expected": {
    "program_result": { "summary": "5 of 7 open pull requests are stale." },
    "plan": { "writes": [ { "kind": "comment", "number": 101 } ] },
    "ledger": { "facade_calls": 6, "round_trips": 1, "error": null, "isolate_start_ms": { "min": 0, "max": 5000 } },
    "apply_outcome": { "applied": 5, "failed": 0 }
  }
}
```

An adversarial case replaces `input` with `{ "program": "fixtures/programs/exfil-fetch.js", "options": { "tickBudget": 10000 } }` and `expected` with `{ "error": "...exact string...", "result": null }`. A contract case replaces `input` with `{ "call": "facade.spec" }` and `expected` with the exact string. An invariant case has `"kind": "invariant"`, a `"runs": 5` field, and `expected` as a list of predicate names from `verify/predicates.ts`.

Normalisation, applied to expected and actual alike: `isolate_start_ms` and `duration_ms` are range-checked, not matched; `created_at` and row `id` become `"<ts>"` and `"<id>"`; object keys are sorted; `result_json` is truncated at the ledger's limit; whitespace inside strings is preserved. Nothing else is touched.

## 9. The standing instruction for a loop pass

The exact content of `loop/PROMPT.md`:

```
You are one pass of a build loop. The verifier decides when the work is done. You do not.

1. Read HANDOFF.md if it exists, then ledger/last-run.json.
2. For each failing case id, read the criteria it covers in criteria/ and the contract in verify/runner/CONTRACT.md.
3. Change only files under packages/ and apps/. Never touch criteria/, fixtures/, gold/, verify/, loop/ or .claude/. If a case looks wrong, say so in HANDOFF.md and move on; a human owns those files.
4. Implement the criterion. Do not special-case the input of a gold case. A fix that only passes the case and not the criterion is a failure a held-out case will catch.
5. Run: sh verify/run.sh. Read the diffs it prints.
6. Fix the smallest set of failing cases you can finish in this pass. Do not break a case that passed when the pass started.
7. Commit with the template in .gitmessage: subject "Pass: <what you fixed>", body with the failing ids before and after. Never push.
8. Rewrite HANDOFF.md: what you changed, what still fails, what you suspect, under 40 lines.
9. Stop.
```

## 10. Report format, end of every step

1. Files created or changed, as a tree.
2. Each check from "Done when", the command, its last 10 lines, its exit code.
3. Open questions, each one line.
4. What the human must verify by hand before the next step.

No summaries of what the plan already says. No praise.

## 11. Gotchas from the prototype, verified 18 November 2026

- Local workerd does not enforce `limits.cpuMs`. A `while (true) {}` inside a Dynamic Worker blocked the local runtime and the host timer never fired. The tick budget in the sandbox package exists for this; in production `cpuMs` is the hard stop.
- A bare `RpcTarget` cannot be placed in a Dynamic Worker's `env`; a loopback handle from `ctx.exports` can. No `exports` block is needed in `wrangler.jsonc`; re-exporting the entrypoint class from the main module is enough.
- Any `ai` binding makes `wrangler dev` open a remote session that fails without a logged-in account. Keep the AI binding in `env.production` only, or run `wrangler dev --local`.
- The `agents/vite` plugin is required for decorators under vitest and Vite, and it needs `@babel/plugin-proposal-decorators` as a devDependency at the version `agents` uses.
- `Symbol.dispose` needs `"lib": ["ESNext", "DOM", "DOM.Iterable"]` in the tsconfig.
- `@cloudflare/vitest-pool-workers` is deprecated; use `@cloudflare/vitest-plugin`. `worker_loaders` work under it.
- `@cloudflare/codemode` 0.5.6 excludes tools with `needsApproval` from the sandbox instead of pausing. That is why writes are a plan and `apply_writes` is an ordinary AI SDK tool.
- The test that calls a write method on the gate directly prints "does not implement createComment" from the RPC shim. The test passes; the line is the rejection being logged.
- Pin `agents` to the exact version. The SDK is pre-1.0 and renamed APIs in minor releases through 2026.
- On this machine zsh expands `--include=*.md` in grep; quote it.

## 12. Sources this file is based on

- [Best practices for Claude Code](https://code.claude.com/docs/en/best-practices): tell Claude what it can't see; give it a check that returns pass or fail; enforce rules that can't have exceptions with hooks; keep CLAUDE.md short; write a spec with a definition of done and build from it in a fresh session; review against the spec with a read-only subagent.
- [Steering Claude Code](https://claude.com/resources/articles/steering-claude-code-skills-hooks-rules-subagents-and-more), Anthropic, June 2026: keep CLAUDE.md under 200 lines; a "never do this" line is not a reliable guardrail; procedures go in skills.
- [The AI engineering stack we built internally](https://blog.cloudflare.com/internal-ai-engineering-stack/) and [Orchestrating AI code review at scale](https://blog.cloudflare.com/ai-code-review), Cloudflare: AGENTS.md covers runtime, test and lint commands, layout, conventions, boundaries, dependencies; stale files are worse than none; the reviewer penalises filler, files over 200 lines, and tool names without runnable commands.
- [How Cloudflare enforces engineering standards using AI](https://blog.cloudflare.com/engineering-standards-enforcement/): RFC 2119 MUST and SHOULD with stable IDs that reviewers cite.
- [agents.md](https://agents.md): the open format, nearest file wins.
- [On the impact of AGENTS.md files on the efficiency of AI coding agents](https://arxiv.org/abs/2601.20404), 2026: 124 pull requests, 28.6 percent lower median runtime and 16.6 percent fewer output tokens with the file present.
- [Instruction adherence in coding agent configuration files](https://arxiv.org/abs/2605.10039), 2026: 1,650 Claude Code sessions; file size, position, architecture and contradictions showed no detectable effect; compliance fell about 5.6 percent per additional generated function within a session.
- [When "Do Not" is not deny](https://arxiv.org/pdf/2608.23550), 2026: prose prohibitions versus built-in controls.
- [Why does CLAUDE.md keep growing?](https://arxiv.org/pdf/2608.11095), 2026: instruction files accumulate and rot.
- [The research is in: your AGENTS.md is probably too long](https://developer.upsun.com/posts/ai/agents-md-less-is-more), Upsun, summarising the ETH Zurich and LogicStar evaluation in which agent-generated context files made agents slightly worse.
- [Spec Kit](https://github.com/github/spec-kit): constitution, specify, plan, tasks, implement, converge.
- `docs/AGENTIC_LOOP_STRATEGY.md` in this folder.
