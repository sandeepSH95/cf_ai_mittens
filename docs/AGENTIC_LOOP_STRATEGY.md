# Build until green: the agentic loop strategy

Date: 20 November 2026.

## The strategy in one paragraph

A builder agent loops until a deterministic verifier says green, and the verifier, the gold set it checks against, and the criteria they trace to are all outside the agent's reach. Two humans (the author and the coordinating agent, before any code exists) write the criteria and the gold set. The builder agent writes code. The verifier decides whether a change passes: not the agent, and not a second model. A held-out set the agent never sees catches overfitting. The author reads the diff before anything merges. The loop itself is the demo: the repository shows an agent that built and verified itself against a fixed target, with every iteration recorded, and a reviewer can read the loop script, the verifier and the gold set in full in ten minutes.

The method is gold-set verification: a fixed set of inputs with expected outputs, checked byte for byte on every change, in the style of a machine-learning evaluation set but with a 100 percent pass bar instead of a score. It applies to everything deterministic the agent builds. Where the system is not deterministic (a live model), the gold set gives way to invariant checks, and the exact-match bar gives way to a pass rate that reports but does not block.

## The loop, drawn

```
 +-------------------- FENCED: humans write it, the agent can only read it (hook + hash) --------------------+
 |  Criteria                      Gold set                           Verifier                                 |
 |  requirement IDs, RFC 2119 --> cases + SHA-256 manifest       --> one runner inside workerd                |
 |  every MUST needs a case       held-out split kept OUTSIDE        exit 0 / 1 / 3 / 4                       |
 +-----------------------------------------------------------------------+-----------------------------------+
                                                                         | same runner, every pass
   +----------------------------+    commit, then verify      +----------v-----------------+
   | Builder agent              | --------------------------> | Verifier run               |
   | fresh session per pass     |                             | manifest + coverage first  |
   | writes src/ and test/ only |                             | every gold case, real      |
   | reads criteria + report    |                             | sandbox; diffs + last-run  |
   +-------------^--------------+                             +----------+-----------------+
                 |                                                       |
                 |                                            +----------v-----------------+
                 |                                            | Record in the ledger       |
                 |                                            | pass, exit code, ids, cost |
                 |                                            +----------+-----------------+
                 |   yes: failing ids + diffs                            |
                 +---------------------------------------------------- exit 1?
                                                                         | no
                                                            +------------v---------------------------------+
                                                            | Human                                        |
                                                            | exit 0: run the held-out set, read the diff  |
                                                            | exit 3 or 4: fix the fence or the gold set   |
                                                            | cap reached: read the ledger, decide         |
                                                            +----------------------------------------------+
```

Everything above the dashed line is written before the loop starts and cannot be changed by the agent. The only path back into the builder is a red verifier. Every other outcome, green included, ends with a human.

## Five principles and the evidence behind each

1. **The judge is not the builder.** Anthropic's harness post (24 Mar 2026) separates a generator from an evaluator because "agents reliably skew positive when grading their own work", and fails a sprint when any criterion falls below a hard threshold. Their evaluator is still a model that "is inclined to be generous towards LLM-generated outputs". Ours is a diff against a file. It has no opinion.
2. **The gold set is out of the builder's reach.** SpecBench (May 2026) measures reward hacking as the gap between visible tests and held-out tests, finds it rises with code size, and concludes richer tests alone do not remove it. The common moves are regenerating golden files, special-casing inputs and editing tests. Consort (Sept 2026) states the rule: enforcement works only through controls the agent cannot edit. Cloudflare says the same about its own practice: hooks enforce, instructions advise.
3. **Exact match for the deterministic core, invariants at the model boundary.** A gold set only fits a system that gives the same output for the same input. The Keyless design already puts every outside dependency behind a driver with a stub, so the sandbox, gate, facade, plan, ledger and approval flow are deterministic end to end. What a live model writes is not. For that layer the check is an invariant (parses, calls only facade methods, plan within limits, survives the exfiltration suite) and the result is a pass rate that reports, never a gate.
4. **The stop condition is external and legible.** The loop ends when the verifier's exit code is zero, not when the agent says it is finished and not when a second model agrees. A ten-line shell loop a reviewer can read beats a feature they have to trust. Claude Code's native goal mode judges the condition with a separate model, which puts the leniency bias back in.
5. **Green is not done.** One documented loop passed all 28 of its tests and a later human review found a spec violation the tests never covered. Cloudflare writes that its AI review "isn't a replacement for human code review". Every criterion carries an ID, every gold case names the IDs it covers, and the author reads the diff before anything merges.

## Repository layout and the fence

Three folders are written by humans before the loop starts and are read-only to the builder for the life of the project. One folder never enters the repository at all.

```
cf_ai_mittens/                      npm workspaces monorepo; the root README leads with the demo
├── criteria/                       requirement IDs per package: SBX-, GATE-, ATK-, APP-, HARN-   human writes, fenced
├── gold/
│   ├── cases/*.json                input + expected output, one file per case                    human writes, fenced
│   └── MANIFEST.sha256             hash of every case file                                       human writes, fenced
├── verify/                         runner, normaliser, reporter                                  human writes, fenced
├── loop/                           loop.sh, PROMPT.md, record.sh, caps                           human writes, agent reads
├── packages/
│   ├── mittens_sandbox/            the room: executor over the Worker Loader, shim, tick budget  agent writes
│   ├── mittens_gate/               the door list: defineReads, defineWrites, the approval tool    agent writes
│   └── mittens_attack/             the harness: adversarial cases against any executor           agent writes
├── apps/
│   └── mittens_demo/               the attack page, CoderAgent, GitHub driver, fixtures          agent writes
├── tools/mittens_harness/          the loop harness; extracted as its own package later          human writes
├── ledger/iterations.jsonl         one line per loop pass                                        loop script appends
├── prompts/log.md                  prompts the author published, verbatim                     agent records
└── .claude/
    ├── settings.json               PreToolUse denies Edit, Write and Bash paths under criteria/, gold/, verify/
    │                               Stop runs verify and exits 2 while red
    ├── rules/                      path-scoped rules for packages/ and apps/
    └── agents/reviewer.md          read-only reviewer: diff against criteria IDs

../mittens_holdout/                 held-out cases, never committed, run by the human only
```

| Folder | Who writes | What enforces it |
| --- | --- | --- |
| `criteria/`, `gold/`, `verify/` | humans, before the loop | a PreToolUse hook that denies Edit and Write on those paths; the verifier checks `MANIFEST.sha256` before every run and refuses to run on a mismatch; CI checks the same hash |
| `loop/`, `tools/mittens_harness/` | humans | the agent reads `PROMPT.md`; it has no reason to write here, and the hook denies it anyway |
| `packages/*`, `apps/*` | the builder agent | the verifier runs `verify/` only; unit tests the agent adds inside a package are welcome but count for nothing in the loop; the demo imports the packages by name, never by relative path, so the module boundary is exercised on every run |
| `ledger/`, `prompts/log.md` | the loop script and the agent | append-only by convention; the hash manifest does not cover them |
| `../mittens_holdout/` | humans | outside the repo, so no agent session in the repo can see or edit it |

The fence is the part a reviewer checks first. If the builder can edit the gold set, the loop proves nothing.

## The gold set

A gold case is one JSON file: an input the system receives, and the output it must produce. We write them by hand from the criteria before any code exists. A case generated by running the first build and saving whatever came out is a snapshot, not a gold case; it would bless the first build's bugs.

```json
{
  "id": "G-012",
  "covers": ["KCM-002", "KCM-003"],
  "kind": "exact",
  "input": {
    "user_message": "Close my stale pull requests",
    "fixtures": "fixtures/octocat-hello-world-v3.json",
    "model_script": [
      { "tool": "code", "program": "programs/stale-prs.js" },
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

Three kinds of case:

| Kind | Input | Expected | Bar |
| --- | --- | --- | --- |
| exact | a user message, a fixture file, a scripted model, an approval answer | the program result, the plan, the ledger row, the apply outcome, the writes the stub received | byte-for-byte match after normalisation; blocks the loop |
| adversarial | a hand-written malicious program loaded straight into the sandbox | the exact error string, or the exact shape of what leaked (nothing): `env` keys equal `["GH"]`, token undefined, no canary bytes in any output | byte-for-byte match; blocks the loop |
| invariant | a user message sent to a live model, N times | predicates: the program parses, calls only facade methods, returns a plan within limits, passes every adversarial check | a pass rate, recorded in the ledger; never blocks |

Normalisation rules, applied to actual and expected alike before the diff: timing fields (`isolate_start_ms`, `duration_ms`) are checked against a range instead of a value; timestamps and row ids are replaced by placeholders; JSON keys are sorted; long results are truncated at the same length the ledger uses. The rules live in `verify/normalise.ts` and are part of the fence.

Traceability: every case names the criteria IDs it covers. The verifier refuses to pass while any MUST criterion has no exact or adversarial case. A criterion without a case is a criterion the loop cannot enforce.

The held-out split: about a quarter of the cases, written in the same session and the same shapes, live outside the repository in `../mittens_holdout/`. The agent never sees them. The author runs them before each merge, and the loop ledger records the result with a flag. The gap between visible and held-out pass rates is the reward-hacking signal SpecBench uses. If the visible set is green and the held-out set is not, the agent learned the cases, not the criteria.

Size: 20 to 40 visible cases and 8 to 12 held-out. Each case should fail for a reason you can name. If you cannot say what bug a case catches, cut it.

## The verifier and the iteration ledger

The verifier is one runner that loads every file under `gold/cases/` and turns each into a test inside the Workers runtime, through vitest and the Cloudflare vitest plugin. Because it runs inside workerd, an exact case exercises the real Dynamic Worker sandbox, the real loopback gate and the real SQLite, not mocks of them.

One run, in order:

1. Check `gold/MANIFEST.sha256` against the files under `gold/` and `verify/`. A mismatch stops the run before any case: the fence is broken, and nothing the run would report could be trusted.
2. Check coverage: every MUST criterion in `criteria/` has at least one exact or adversarial case. A missing one stops the run.
3. Run the cases. Print one line per case: id, PASS or FAIL, the criteria IDs, the time. On a failure, print a unified diff of the normalised expected and actual, capped at 60 lines.
4. Print the summary line and write `ledger/last-run.json` with the same facts for machines.

| Exit code | Meaning | What the loop does |
| --- | --- | --- |
| 0 | every case passed, every criterion covered | stop, hand to the human |
| 1 | at least one case failed | feed the failing ids and diffs into the next pass |
| 3 | fence broken: manifest mismatch | stop, hand to the human; the agent touched the gold set |
| 4 | uncovered criterion | stop, hand to the human; the gold set is incomplete, not the code |

The iteration ledger is `ledger/iterations.jsonl`, one line per loop pass, appended by the loop script and never by the agent: the iteration number, timestamp, commit hash, verifier exit code, pass and fail counts, the failing case ids, wall time, and tokens and cost when the headless run reports them. A held-out run adds a line with a flag. This file is the evidence that the agent built and verified itself. A reviewer can plot pass count per iteration from it, and so can the README.

The same verifier runs in three places: the loop script, the Stop hook (exit 2 while red, so an interactive session cannot end on a failing build), and CI on every push. One runner, three callers, no second definition of green.

## Loop mechanics in Claude Code, November 2026

Seven ways exist to make Claude Code keep going. Two of them let the verifier decide. The rest let a model decide, which is the thing this strategy exists to avoid.

| Mechanism | What decides "done" | Verdict | Why |
| --- | --- | --- | --- |
| A shell loop around headless `claude -p`, verifier exit code as the stop (the Ralph pattern) | the verifier | Use | Ten lines a reviewer reads in full. Fresh context every pass, so state lives in the repo and the ledger, not in a growing conversation. Easy to cap. |
| Stop hook that runs the verifier and exits 2 while red | the verifier | Use | Makes an interactive session unable to end on a failing build. Same runner as the loop. Needs its own iteration counter so a stuck session cannot spin forever. |
| `/goal <condition>`: Claude keeps working until the condition is met | a separate model judges the condition | Avoid as the gate | The judge is a model again, with the leniency bias the strategy removes. Fine for soft goals such as "the README reads well". Not the gate. |
| `/loop [interval] [prompt]`: rerun a prompt on a schedule | a timer | Avoid as the gate | Built for polling and maintenance. It does not know whether the build is green. |
| The ralph-loop plugin: Stop hook plus a completion phrase and an iteration cap | the agent emits the phrase | Optional | The agent decides when it is finished. Acceptable only if the same Stop hook also runs the verifier, at which point the plugin adds the cap and little else. |
| Workflow scripts: deterministic orchestration of several agents | the script | Optional | Good for the review stage after green: a coordinator fans out specialist reviewers over the diff, which is the shape Cloudflare describes for its own code review. Not needed for the build loop. |
| Plugin evals (`claude plugin eval`) | graders over eval suites | Optional | Evaluates prompts and skills, not products. Useful for testing `loop/PROMPT.md` itself against variants. Separate from the gold set. |

The loop script, in full:

```sh
#!/bin/sh
# Build until green. The verifier decides, not the agent.
MAX_PASSES=12
pass=0

while [ "$pass" -lt "$MAX_PASSES" ]; do
  pass=$((pass + 1))

  claude -p "$(cat loop/PROMPT.md)" --output-format json > "ledger/pass-$pass.json"

  sh verify/run.sh
  code=$?
  sh loop/record.sh "$pass" "$code"      # one line into ledger/iterations.jsonl

  [ "$code" -eq 0 ] && exit 0            # green: hand to the human
  [ "$code" -ge 3 ] && exit "$code"      # fence broken or criterion uncovered: human
done

exit 1                                   # cap reached and still red: human
```

`loop/PROMPT.md` is the standing instruction for every pass: read `criteria/`, read `ledger/last-run.json`, fix the failing cases in `src/`, do not touch `criteria/`, `gold/` or `verify/`, commit with the prompt that drove the change in the body, write a short `HANDOFF.md` for the next pass, stop. The headless run needs its permission settings set once; the deny hooks apply to it the same as to an interactive session.

## Cost, caps and stopping rules

A loop with no cap is a bill with no ceiling. Anthropic's full generator-plus-evaluator harness took 6 hours and about $200 for one app where a solo run took 20 minutes and $9. This loop is cheaper per pass because the judge is a diff, not a model, but each pass still spends a full agent session.

Caps, all set in `loop/`:

- Passes per run: 12. A build that is still red after 12 fresh attempts has a criteria or gold-set problem, not a code problem.
- Turns per pass: set with the headless run's turn limit, so one pass cannot wander.
- Plateau: if the set of failing case ids is identical for 3 passes in a row, stop early. The ledger shows the plateau and the author decides.
- Wall time per run: 2 hours.

Stopping rules, by verifier exit code: 0 means run the held-out set, then human review; 3 or 4 means human, because the fence or the gold set needs attention, not the code; a cap means human, with the ledger showing where it stuck.

Each pass starts a fresh session. The state it needs is in the repository (the code, the criteria, the last verifier report) and in a short `HANDOFF.md` the previous pass wrote. This is the context-reset pattern from Anthropic's harness work, and it is why the ledger must carry everything a human needs: the agent's own memory of a pass is gone when the pass ends.

Quota is a real constraint on this machine. The 18 November build was paused for it. Run loops with the cap set low first, read the ledger, then raise it.

## The order we build it together

Everything in this list happens before the builder loop runs for the first time. It is the sprint contract. The existing prototype already passes 30 tests, so the first gold set can be checked against it as a dry run of the loop mechanics before the real build starts.

- [ ] Monorepo skeleton: `packages/mittens_sandbox`, `packages/mittens_gate`, `packages/mittens_attack`, `apps/mittens_demo`, npm workspaces, one base tsconfig, one vitest project per package. Move the prototype in with no behaviour change and keep its 30 tests green. This is the dry run of the loop.
- [ ] Criteria: rewrite KCM-001 to KCM-010 for the real version as 15 to 25 MUST and SHOULD statements in RFC 2119 wording, grouped by package (SBX, GATE, ATK, APP, HARN), each with one line saying how a gold case proves it. The public API of each package is a criterion.
- [ ] Fixtures: two or three small repository snapshots as JSON, including the edges (no pull requests, drafts only, a list that hits the 100-item page limit).
- [ ] Gold cases: exact cases per criterion from the fixtures; adversarial cases from the existing exfiltration programs plus new ones; API contract cases per package; invariant predicates for the live-model eval.
- [ ] Held-out set: written in the same session, moved to `../mittens_holdout/`, never named in `loop/PROMPT.md`.
- [ ] Verifier: runner, normaliser, reporter, manifest check, coverage check, exit codes as constants.
- [ ] Hooks and CI: PreToolUse deny on the fenced paths (Edit, Write and Bash paths alike), Stop running the verifier; CI running the verifier and the manifest check on every push, and publishing the packages with provenance on a tag.
- [ ] Loop: `loop.sh`, `PROMPT.md`, `record.sh`, the caps. Dry run against the moved prototype and read the first ledger lines.
- [ ] First commit: the fenced folders, the loop and the hooks, with this strategy in the commit body. Then the author says go.

## Cold truths

- The gold set is only as good as the criteria. A wrong expected output is enforced with the same force as a right one. Two humans writing cases by hand will get some wrong, the first loop passes will find them, and every fix to a gold case is a human commit with a reason, recorded in the ledger. A gold set that changes during the loop without a reason is the loop grading itself.
- Reward hacking needs no malice. An agent special-cases an input when that is the shortest path to green. The held-out gap is the only honest measure, and 8 to 12 held-out cases is a small sample. Treat a gap of one case as a signal, not noise.
- One hook is porous. A PreToolUse deny on Edit and Write does not stop a shell redirect into `gold/`. The deny must also read Bash commands for fenced paths, and the hash manifest is the backstop that catches whatever the hook misses. The fence is two layers because one layer is not a fence.
- Exact-match verification on a stubbed model proves the pipeline, not the model. Whether it works with a real model is a separate question. The invariant pass rate answers that, and every run of it costs money.
- The loop is not faster than a person driving a session for a project this size. Its value is evidence, not speed. The ledger, plotted per pass, is that evidence.
- Headless runs draw on the same quota as interactive ones. A loop with the cap at 12 can spend a day's quota in an hour.
- One documented loop passed all its tests and failed review. Nothing here removes the human read of the diff; it only makes that read shorter.

## Sources

- [Harness design for long-running apps](https://www.anthropic.com/research/harness-design-long-running-apps), Anthropic, 24 Mar 2026: generator and evaluator split, "agents reliably skew positive when grading their own work", hard thresholds, sprint contracts, context resets, cost figures
- [SpecBench: measuring reward hacking in long-horizon coding agents](https://arxiv.org/abs/2605.21384), May 2026: visible versus held-out tests as the measure
- [Consort: a spec-first agent framework](https://arxiv.org/pdf/2609.09671), Sept 2026: enforcement only through controls the agent cannot edit
- [SpecGuard](https://arxiv.org/pdf/2610.09159), Oct 2026: check the verifier before trusting a pass
- [What is reward hacking](https://specstory.com/learning/verification/reward-hacking), SpecStory: the regenerate-the-golden-files pattern
- [How Cloudflare enforces engineering standards using AI](https://blog.cloudflare.com/engineering-standards-enforcement/), Cloudflare, Aug 2026
- [Orchestrating AI code review at scale](https://blog.cloudflare.com/ai-code-review), Cloudflare: "isn't a replacement for human code review"
- [Claude Code commands reference](https://code.claude.com/docs/en/commands): `/goal`, `/loop`, `/export`
- [Claude Code hooks reference](https://code.claude.com/docs/en/hooks): PreToolUse, Stop, UserPromptSubmit
- [Claude Code loop: five ways to run one](https://www.aakashg.com/claude-code-loop/)
- [Ralph loop's code passed 28 tests, then failed review](https://orbi.build/blog/ralph-loop-claude-code/)
- [Loop engineering with Claude Code](https://dev.classmethod.jp/en/articles/loop-engineering-claude-code-autonomous/), Classmethod: exit codes as the stop, a review agent for test gaming
- [ralph-claude-code](https://github.com/frankbria/ralph-claude-code), GitHub
- [Self-evaluation bias in long-running agent loops](https://arxiv.org/pdf/2607.25152), arXiv
- The Keyless Code Mode prototype in `cf_ai_keyless_codemode/`
