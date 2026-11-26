# PROMPTS.md

The AI prompt history of this repository.

Every quote marked **[exact]** is a prompt the author typed, copied from [prompts/log.md](prompts/log.md) with its typos. Everything marked **[summary]** is written after the fact and is not a prompt.

## Read this first: what is and is not in this record

| Question | Answer |
| --- | --- |
| Which tool and model? | Claude Code. Model `claude-fable-5-1` until 25 November 2026, `claude-fable-5-2` after. |
| Who typed the prompts? | The author. One long prompt of 23 November is a handover note that an agent drafted and the author pasted. It is marked in the log. |
| Is the prompt log complete? | No. The author chose which prompts to publish. Prompts that were not about the build are left out. No published prompt was altered, with these exceptions of 26 November: four words of one pasted handover note, and three passages of the prototype's record in the lineage file, are withdrawn. Each place is marked "Not published". Absolute paths in the briefs are shortened to `<repo>`. |
| Who recorded the prompts? | The agent, at the start of each turn. A hook did this in a first version of the repository. The hook only fired in sessions started inside the repository folder, so that version was dropped on 25 November and its entries were carried over. |
| Who wrote the code? | Agents wrote all of it. The author made the decisions quoted below and approved the gold set. |
| Who wrote the expected values of the gold cases? | An agent derived them. The author compared the 11 exact cases of the first set with the output of a derivation script and approved the set. Later cases were proposed by the agent in tables and approved by the author before signing. Every case carries the line `"verified": "by agent, <date>"`. |
| Was the history rewritten? | Yes, on 25 November, before the first push: to remove the held-out cases from every commit so that the builder could not read them, and to remove prompts that the author chose not to publish. And a second time on 26 November, before the repository was made public: to remove texts that the author chose not to publish from every commit, and to name the author in one way. The commit ids in this file, in the ledger and in the prompt log are the ids after that rewrite. Authors, dates and the order of the commits did not change. |
| What is not recorded? | The planning conversation before this repository existed (summarised in [prompts/00-prototype-lineage.md](prompts/00-prototype-lineage.md)), and the transcripts of the six builder passes. A pass is recorded by its standing prompt, its commit, its ledger line and its handoff note. |

Three records were written as the work happened, and they can be checked against each other:

| Record | Written by | Where |
| --- | --- | --- |
| The prompt log | the agent, per turn | `prompts/log.md` |
| The loop ledger | a script, per pass | `ledger/iterations.jsonl` |
| The commit bodies | the agent, with the prompt that drove the change | `git log` |

## The method in one paragraph

The author's method is validation-driven development. The criteria come first, then a gold set of expected outputs, then a deterministic verifier. An agent builds in a loop, and only the verifier's exit code ends the loop. The builder cannot edit the criteria, the gold set or the verifier. The prompts below follow that order.

## Phase 0: a prototype and a plan [summary]

A prototype named Keyless Code Mode was built on 18 November 2026 in a separate workspace. Its own prompt record is copied in the lineage file. The plan for this repository, [docs/PLAN.md](docs/PLAN.md), was written before any build prompt, so that the first prompt could point at a committed plan.

## Phase 1: criteria and a verifier before any product code

The first build prompt asked for checks, not for features:

> Turn my criteria into deterministic checks that run in in typescript

**[exact]**, 23 November. Result: the verifier skeleton with its stages (manifest, lint, coverage, case runner) and its exit codes.

The author then had the verifier itself attacked:

> You are a verification expert. Review the current state of my verifiers to find possibel weaknesses

**[exact]**, 23 November. The weaknesses that were found were fixed before any gold case existed.

A question from this phase shows what the author wanted to be sure of:

> one thing I dont' understand babout hte ciretria files is, how are they deterministically run? is it a case of tryusting th ellm judge to adere to what the .md files tell them, or is actual code verification ebign run?

**[exact]**, 25 November. The answer is in the design: a criterion is only a row in a table. A gold case names the criteria it covers, and code compares the build's output with the case. No model judges anything.

## Phase 2: the working agreement

> ok nice, give me a table of all the next steps we need to take in order to build this system and which steps require a human in the loop. I want to be able to send you off to build and verify as much as you can as agents, and then only come back to me for clarification or get needed input before being set off again

**[exact]**, 25 November. From here the pattern of the session is fixed: the agent proposes steps in a table, the author approves or changes them, the agent works and reports.

## Phase 3: the gold set

The agent drafted fixtures and gold cases and listed the decisions it could not take alone. The author decided them:

> 1. A with generates strings:
>
> * `Plan refused: 26 writes, the limit is 25`
> * `Plan refused: a comment has 4001 characters, the limit is 4000`
> * `Plan refused: write kind 'merge_pull_request' is not allowed`
> * `getPullRequest: 'number' must be a positive integer`
>
> 2. A, strictly more than 30 days
> 3. A move out to mittens_holdout

**[exact]**, 25 November. Three decisions: the gate owns its refusal messages (they do not come from a library), "stale" means strictly more than 30 days, and the held-out cases live outside the repository.

> purge held-out form history and fix verification sheet by cleaning old library text

**[exact]**, 25 November. The held-out cases had been committed in an early draft. They were removed from every commit.

> sign by agent, I approve the cases

**[exact]**, 25 November. The author ran the derivation script, compared its output with the cases and approved the set. The agent had first tried to sign the set on its own; the tool's permission system refused that as a step that needs a human, and the agent stopped and asked.

## Phase 4: the loop

> A
> Continue with go for 3

**[exact]**, 26 November. "A" settled a gold case that no build could pass: it compared an error text that differs between the production runtime and the test runtime. The case now tests the behaviour. "Go for 3" started the fence hooks and the loop scripts.

Each builder pass is a fresh headless session with one standing prompt, [loop/PROMPT.md](loop/PROMPT.md). It is 9 numbered lines. The lines that matter most:

> You are one pass of a build loop. The verifier decides when the work is done. You do not.

> Implement the criterion. Do not special-case the input of a gold case. A fix that only passes the case and not the criterion is a failure a held-out case will catch.

**[exact]**, from the standing prompt. The builder's six commits are the ones whose subject starts with "Pass:".

| Pass | Passing cases | Builder commit |
| --- | --- | --- |
| 0 | 3 of 38 | baseline |
| 1 | 19 | `022254b` |
| 2 | 26 | `c577f48` |
| 3 | 38 | `7533b91` |
| 4 | 40 of 40 | `90ede02` |
| 5 | 46 of 46 | `3ffa9a8` |
| 6 | 48 of 48 | `15bc5b3` |

The first run was started with a cap of 12 passes and stopped by hand during pass 3:

> set to one pass and re-run

**[exact]**, 26 November. From then on the author read each pass before the next one started.

## Phase 5: what the green verifier did not prove

The first held-out run gave 9 of 12. The agent reported the three failures and three ways to answer them. The author chose:

> A

**[exact]**, 26 November. Option A: correct the one gold case that was wrong, state the two missing error wordings in the criteria, and let the loop fix the build. The first score of 9 of 12 stays in the record.

A read-only review of the builder's commits then found nine gaps that the cases could not see. Two were regressions against the prototype.

> Provide A an B for approval

> approve ad reccomended

**[exact]**, 26 November. Every finding became a gold case first, shown to the author with its expected value, and a fix second, through the same loop.

The builder had added one public method for a host-side count. The author did not accept it on a claim:

> provide details of the contGateCall decision

> go with A, however we need to have verification on how a browser client may call it

**[exact]**, 26 November. Result: a test that opens the page's own WebSocket, sends the client's call and expects the refusal. The test was checked against a mutation: with the method marked as client-callable, it fails.

> The extra RPC is acceptable for our first version. Log the sanbox issue for future investigation.

**[exact]**, 26 November. Result: [docs/KNOWN_ISSUES.md](docs/KNOWN_ISSUES.md), which now has seven entries.

> Loop pass is running. From now on run the lop and held out run automatically

**[exact]**, 26 November. Until this prompt the author started every loop run and every held-out run by hand.

## Phase 6: the demo and the README

> approve as reccomended. ensure frontends use shadcn styling. stub by default. README shoudl follow a show before tellign methodoligy, with diagram, and legger s a chart with link to known issues

**[exact]**, 26 November. Result: the attack page, the README that opens with the attack result, and the ledger chart that a script draws from the ledger.

The author then used the page and found that it misled:

> Please label excplicitly, to indicate expected results

**[exact]**, 26 November. The page showed a breach in the naive executor with no word that the breach was the intended result. Each card now states its expected result before the run and says after the run if the report matches.

## The briefs given to subagents

The coordinating agent gave six pieces of work to subagents. Each brief is in the repository, and each result was checked by the coordinator before it was committed.

| Brief | Work |
| --- | --- |
| [s4-gold-drafts.md](prompts/briefs/s4-gold-drafts.md) | Draft fixtures and gold cases |
| [s6-move-prototype.md](prompts/briefs/s6-move-prototype.md) | Move the prototype into four workspaces, no behaviour change |
| [s3-adapter.md](prompts/briefs/s3-adapter.md) | The verifier's adapter and its contract |
| [s8-review.md](prompts/briefs/s8-review.md) | First read-only review of the loop's build |
| [s8-review-2.md](prompts/briefs/s8-review-2.md) | Second read-only review |
| [s9-frontend.md](prompts/briefs/s9-frontend.md) | The demo page in shadcn styling |

## Where the agent was wrong

These are the agent's errors in this build, each with its fix in the history:

| Error | How it was found | Fix |
| --- | --- | --- |
| A gold case expected a runtime error text that no build could produce in the test runtime. | The first real run of the cases | The case tests the behaviour (`192403f`) |
| A held-out case had a wrong expected value: it named `getPullRequest`, and its program calls `listComments`. | The first held-out run | Corrected (`2fff9a6`) |
| Three gold cases sent "approve" and expected a refusal. They locked in a wrong order: validation after approval. | The first review | The cases now expect that no approval is asked (`0e5c90b`) |
| The loop's Stop rule in the plan was "no pass ends red". With 35 failing cases that makes the first pass the whole loop. | Before the first run | The rule is "no pass ends worse than it started" (`192403f`) |
| The builder passes were started with the caller's whole environment. | An automated security review of the commit | Credential variables are stripped and network tools are denied (`52a0532`) |
| A commit went in with a failing typecheck. | The agent's own check, one step late | The next commit (`a4020db`) |
| The attack page showed a breach with no word that it was expected. | The author, on first use | Explicit labels (`0f2ee10`) |
| The live model path was never run before the last day. The model call named no output limit, so Workers AI cut each answer at 256 tokens. A program ran in 2 of 5 live runs, and no plan reached the human. | The first live-model check, after the author's login | An output limit and one more line in the system prompt. Then 5 of 5. |
