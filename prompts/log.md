# Prompt log

The prompts the author typed to Claude Code while building this repository, recorded by the agent at the start of each turn, verbatim, with the UTC time, the first eight characters of the session id, and the commit they were typed against. The author decides which prompts are published here: prompts that were not about the build, or that the author chose not to publish, are omitted. No recorded prompt was altered, typos included. The agent refuses to record a prompt that contains a credential-shaped string. The curated narrative is `PROMPTS.md`; this file is where a quote is checked.

## Entries carried over from the abandoned hook version, 23 November 2026

The entries below were written by the prompt hook in the first version of this repository (see `prompts/00-prototype-lineage.md`, section 0) and are carried over unchanged. Their HEAD values refer to that version's commits. Six shell commands the hook swept up as prompts are omitted. The entry of 15:09:57 is a handover note drafted by the planning agent and pasted by the author as the first prompt of a new session; it is the prompt that started step S2.

## 2026-11-23T15:05:00Z, session dfdda72e, HEAD 544b845, appended by the agent

(Capture note: this session was started in the parent workspace, outside this repository's hook, so the hook did not fire. The coordinator agent appended the prompt below from the session transcript, verbatim. Every entry marked "appended by the agent" was written this way; entries without the mark were written by the hook.)

complete. after this prompt, all further prompts I make to you must be recorded verbatim. Feel free to commit things yourself

## 2026-11-23T15:09:57Z, session 0194ecd8, HEAD 624cd11

<pasted_content id="2038">
Resuming the Mittens build in this folder so the repo's own hook captures every prompt. Context for you:

This repo is cf_ai_mittens. [Four words not published. The author withdrew them on 26 November 2026.] A chat agent where the model writes one JavaScript program against a read-only GitHub facade; the program runs in a Dynamic Worker with no network and no token; reads cross to a host gate over RPC; writes come back as a plan a human approves. It is built as three packages (mittens_sandbox, mittens_gate, mittens_attack) plus a demo app, by an agent loop against a fenced gold set. The 18 Nov 2026 prototype it grew from is recorded in prompts/00-prototype-lineage.md.

Read docs/PLAN.md first. It is the step-by-step plan, one step per session. docs/AGENTIC_LOOP_STRATEGY.md and [a second document, since removed] explain why it is shaped that way.

State: steps S0 and S1 are done and committed (4 commits, clean tree). Next is S2, criteria. Then S3, the verifier skeleton, then S4, the gold cases.

Rules for working with me:

1. Validation-driven development. I supply or verify a gold set per step. Progress is measured only by the verifier's exit code and failing case ids, never by your own judgement. Never edit criteria/, gold/cases/, verify/ or loop/ once they exist; propose changes in your report. Drafts go to gold/drafts/.
2. Every prompt I type is captured verbatim by the hook into prompts/log.md. Never edit that file. Your first action in any step is the capture check in PLAN.md S2, item 0.
3. You may commit your own work. Use the template in .gitmessage: the prompt that drove the change in the body, the verifier result before and after, subject in the imperative mood under 50 characters.
4. End each step with the report format in PLAN.md section 10: files, each check with its command, its last lines and its exit code, open questions, and what I must verify by hand. No praise, no restating the plan.
5. No em dashes anywhere. Short sentences. Cold truth over reassurance.

Now: Read docs/PLAN.md step S2 and do it.
</pasted_content id="2038">

## 2026-11-23T15:39:30Z, session e25704f3, HEAD 624cd11

Turn my criteria into deterministic checks that run in in typescript

## 2026-11-23T15:43:56Z, session e25704f3, HEAD 624cd11

Yes, swap

## 2026-11-23T15:44:43Z, session e25704f3, HEAD 624cd11

You are a verification expert. Review the current state of my verifiers to find possibel weaknesses

## 2026-11-23T15:49:00Z, session e25704f3, HEAD 624cd11

Yes, fix them

## 2026-11-23T17:08:11Z, session e25704f3, HEAD 624cd11

list next steps


## 2026-11-25T15:15:16Z, session dfdda72e, HEAD 69fecac

ok let's port
