# Prototype lineage

This repository grew from a prototype called Keyless Code Mode, built on 18 November 2026 in a separate research workspace that is not published. This file records how that prototype was prompted, how this repository was planned, and how its prompt record works. Sections 2 and 3 are copies, with the marked omissions that section 1 lists; nothing in them was written for this repository.

## 0. Provenance of this repository

Planning took place in the research workspace between 20 and 23 November 2026 with Claude Code (model claude-fable-5-1): the strategy documents in `docs/`, the name, the step plan.

A first version of this repository was created on 23 November 2026 with a hook that appended every prompt to the log before it reached the model. It reached four commits and some uncommitted work. On 25 November 2026 the author dropped it, because the hook only fires in a session started inside the repository folder, which made the capture a constraint on how the work could be done. That version is kept in a local backup and is not published. This repository was restarted from the same planning documents the same day, on the author's instruction.

From this point the record works as the header of `prompts/log.md` states: the agent records the author's prompts at the start of each turn, verbatim; the author decides which prompts are published; no recorded prompt is altered. The agent commits its own work, with the prompt that drove it in the commit body.

## 1. How the prototype was built

Two Claude Code agent instances (model claude-fable-5-1) built the prototype on 18 November 2026: the first was stopped during a quota pause and the second resumed from the files on disk. The prototype's `PROMPTS.md`, copied in section 2, quotes the author's original request and both builder briefs verbatim and summarises the build log. Home directory paths are shown as `~` or `<workspace>`, the agent scratchpad path as `<scratchpad>` and the session id as `<session>`. Three passages are withdrawn and marked "Not published": the original request, its copy inside the first brief, and one paragraph of context in the common brief. Nothing else was changed.

The prototype's requirement IDs (KCM-001 to KCM-010) are carried into `criteria/` under new prefixes; the spec is copied in section 3 so the mapping can be checked.

## 2. The prototype's PROMPTS.md, verbatim

# PROMPTS.md

The AI prompt history for this repository. Everything marked [exact] is pasted as received. Everything marked [summary] is a log written by the agent of what it decided while building; it is not a prompt the human typed.

Tool: Claude Code (Anthropic), model claude-fable-5-1, 18 Nov 2026. Two agent instances built this repo; see section 3.

Note on the two grep commands below that contain an em dash character: this repository forbids em dashes in every file, including this one, so that single character is written as `U+2014` inside the quoted commands. Nothing else was changed.

### 1. The user's original request [exact]

> [Not published. The author withdrew this passage on 26 November 2026.]

### 2. The builder briefs the agent received [exact]

### 2.1 Prototype-specific brief (first instance, 18 Nov 2026)

```text
Build Prototype 2, "Keyless Code Mode" (cf_ai_keyless_codemode), a working Cloudflare Agents SDK project, in the folder <workspace>/cf_ai_keyless_codemode (create it; it does not exist).

FIRST read these two files in full, in this order:
1. <scratchpad>/<session>/scratchpad/BUILDER_BRIEF_COMMON.md  (coding rules, required repo contents, definition of done, final report format; all mandatory)
2. <scratchpad>/<session>/scratchpad/BUILD_RECIPE.md  (verified versions and config files)
Then read lines 634 to 834 and lines 1343 to 1371 of <workspace>/reports/<research report>.md (use sed -n; do not read the whole file). After `npm install`, read node_modules/agents/docs/codemode.md, chat-agents.md, human-in-the-loop.md, models.md, callable-methods.md, observability.md and state.md, and the README and d.ts files of node_modules/@cloudflare/codemode (pin 0.5.6; check `npm view @cloudflare/codemode version` first and use the latest 0.5.x). Also fetch the live docs https://developers.cloudflare.com/dynamic-workers/api-reference/ and https://developers.cloudflare.com/dynamic-workers/examples/codemode/ and https://developers.cloudflare.com/dynamic-workers/getting-started/ with WebFetch, because the loopback-binding wiring (`exports` in wrangler.jsonc and `ctx.exports`) is thinly documented and must be copied from the live page.

### What Keyless Code Mode is
A chat agent where the model writes ONE TypeScript/JavaScript program against a typed read-only GitHub facade (for example "list my open PRs older than 30 days and draft a closing comment for each") instead of making N tool calls. The program runs in a fresh V8 isolate via Dynamic Workers (`env.LOADER.load(...)`) with `globalOutbound: null` (no network) and a CPU limit. The GitHub token lives only on the host side, behind a loopback binding to a `WorkerEntrypoint` ("GitHubGate") that exposes READ methods only. Generated code never sees the token. WRITES (comment, close) are never executed by generated code: the program returns a plan, and an `apply_writes` tool with `needsApproval: true` executes it only after a human clicks Approve. An exfiltration test suite proves the boundary. Deploying needs Workers Paid (Dynamic Workers); local `wrangler dev` runs Dynamic Workers locally.

### Required behaviour (turn into specs/001-keyless/spec.md with IDs KCM-001...)
- KCM-001 Generated code MUST NOT reach the network: `fetch()` inside the isolate throws or fails; the executor passes `globalOutbound: null`.
- KCM-002 The token MUST NOT be readable from the isolate: `env.GITHUB_TOKEN` is undefined inside the isolate; `Object.keys(globalThis)` and `JSON.stringify(env)` contain no token bytes; the only binding passed is the loopback `GH` facade.
- KCM-003 Writes MUST require human approval: `apply_writes` carries `needsApproval: true`; a denied call executes nothing; an approved call executes through the host-side GitHub driver.
- KCM-004 The ledger MUST record, per program run: number of facade calls made inside one program, number of model round trips, isolate start milliseconds (from `load()` to first facade call), and tokens in/out from the AI SDK `usage` when available.
- KCM-005 A runaway program (infinite loop) MUST be stopped by the CPU limit or an outer timeout and reported as an error, not hang the agent.
- KCM-006 The GitHub driver MUST be behind an interface with a real implementation (fetch to api.github.com with the token from `env.GITHUB_TOKEN`) and a fixture-backed stub (`GITHUB_DRIVER = "github" | "stub"`), so tests and local dev need no token.
- KCM-007 The model MUST be behind a driver: `WorkersAiModelDriver` (createAI from `agents/models/ai-sdk`, model `@cf/openai/gpt-oss-120b`, alternative `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) and `StubModelDriver` that returns a fixed, valid program for the facade (so the whole loop can be tested without an account).
- KCM-008 Chat MUST go through `AIChatAgent` with tools `code` (from `createCodeTool` of `@cloudflare/codemode/ai` wrapping a `DynamicWorkerExecutor`, or, if that API has moved, the equivalent documented in node_modules/@cloudflare/codemode) and `apply_writes`; `stopWhen: stepCountIs(6)`.

### Layering
src/drivers/sandbox.ts (wraps env.LOADER.load with the fixed security options; the ONLY file that touches LOADER), src/drivers/github.ts (+ stub with fixtures in test/fixtures), src/drivers/model.ts, src/services/facade.ts (typed read-only facade + a `spec()` string that describes it to the model), src/services/plan.ts (validate and apply write plans), src/services/ledger.ts, src/gate.ts (the WorkerEntrypoint "GitHubGate" that holds the token), src/server.ts (CoderAgent + default export).

### Tests (vitest inside workerd; each file names the KCM IDs it covers)
- test/exfiltration.test.ts: KCM-001, KCM-002, KCM-005. Load hand-written malicious programs through the sandbox driver: one calls fetch (assert rejection), one returns `typeof env.GITHUB_TOKEN` and `Object.keys(globalThis)` (assert no token), one loops forever (assert it is terminated within the timeout).
- test/approval-gate.test.ts: KCM-003.
- test/facade.test.ts: KCM-006 with the stub driver.
- test/ledger.test.ts: KCM-004: one program making 7 facade calls -> facade_calls = 7, round_trips = 1.
IMPORTANT: verify early whether `worker_loaders` bindings work under @cloudflare/vitest-plugin. If they do not, write these tests as an HTTP end-to-end suite against `wrangler dev` (spawn it on a free port from a global setup, or as `npm run test:e2e`), keep the unit tests that do not need LOADER in vitest, and state the split in README Limitations. Do not skip the exfiltration tests.

### wrangler.jsonc (base on the report's 5.4, compatibility_date "2026-11-01")
`ai` (AI, remote true), `worker_loaders` [{ binding: "LOADER" }], durable object CoderAgent (SQLite), observability traces, assets run_worker_first ["/agents/*"], plus whatever `exports` block the live Dynamic Workers docs require for the loopback entrypoint. Secrets: `GITHUB_TOKEN` via `.dev.vars` (example file only).

### .claude/rules/sandbox.md content
paths: ["src/drivers/sandbox.ts", "src/gate.ts"]. Rules: `globalOutbound` must be `null`; never pass secrets in the Dynamic Worker `env`; only READ methods on the gate are exposed to the sandbox; every write goes through `apply_writes`. Also add a PreToolUse hook in .claude/settings.json that denies `wrangler secret` commands (exit 2) with a message to use the release skill.

### README extras
A "Lineage" section: Cloudflare Code Mode (Sept 2025) -> Dynamic Workers open beta (24 Mar 2026) -> Claude Code Code Mode (12 Nov 2026), and one sentence that the five official codemode examples exist and what this repo adds (the exfiltration suite, the read/write split, the typed GitHub facade, the ledger). A security-model ASCII diagram showing where the token lives and the isolate boundary.

### UI
Minimal React 19 chat page (useAgentChat): messages, input, Approve/Reject for `apply_writes`, a panel that shows the last generated program and the ledger row for it.

### PROMPTS.md must quote this as the user's original request [exact]:
[Not published. The author withdrew this passage on 26 November 2026.]
and then paste this whole prompt and the common brief verbatim as section 2 [exact].

Work through the definition of done in the common brief and finish with the final report format it specifies. Do not stop at a partial build; if an API differs from the report, follow the shipped docs and record the difference.
```

### 2.2 Common brief for the three prototype builders

```text
### Common brief for the three Cloudflare prototype builders (18 Nov 2026)

### Context
[Not published. The author withdrew this passage on 26 November 2026.]

A full research report exists at:
  <workspace>/reports/<research report>.md
Read ONLY the section for your prototype (line ranges given in your prompt) plus Appendix B.5 (rename/deprecation cheat sheet, around lines 1343 to 1371). Do not read the whole report.

A verified toolchain recipe (versions that work together on this machine, config files to copy verbatim, gotchas) is at:
  <scratchpad>/<session>/scratchpad/BUILD_RECIPE.md
Read it first and copy its config shapes. Key facts: agents@0.33.0 exactly, wrangler@4.164.0, vitest 5.x with @cloudflare/vitest-plugin (NOT the deprecated vitest-pool-workers), tsconfig `extends: "agents/tsconfig"`, and `agents()` from `agents/vite` in BOTH vitest.config.ts and vite.config.ts (decorators fail without it).

After `npm install`, the ground-truth API docs for agents@0.33.0 are inside the package: `node_modules/agents/docs/*.md` (for example chat-agents.md, scheduling.md, workflows.md, human-in-the-loop.md, mcp-servers.md, mcp-client.md, models.md, observability.md, callable-methods.md, email.md, browse-the-web.md, codemode.md, lifecycle.md, routing.md). READ the relevant doc file before using any API. The public starter template is four months behind; do not copy it. Also inspect `dist/*.d.ts` when a doc is ambiguous.

This machine is NOT logged in to Cloudflare. Workers AI, Browser Run, Email and AI Gateway cannot be exercised here. Every such call must sit behind a driver interface with (a) a real Cloudflare implementation and (b) a deterministic local stub, selected by an environment variable (use a string enum, for example `MODEL_DRIVER = "workers-ai" | "stub"`, default `stub` in `.dev.vars.example` and in tests). Tests and `wrangler dev` must pass with the stub and no account. For the AI SDK side, `MockLanguageModelV3` from `ai/test` (check the installed `ai` version for the exact name) is an acceptable stub for streamText.

### Coding rules (from the user's global CLAUDE.md; mandatory)
- No em dashes anywhere (code, comments, docs). Use a comma, colon or parentheses.
- Avoid magic numbers and strings: extract recurring or meaningful values into descriptive `const` or enums. Values from a spec (HTTP 402, header names) are constants regardless.
- Reduce indentation: early return and continue; no arrow anti-pattern.
- Function names shorter than 30 characters.
- Use enums (string unions or `as const` objects) instead of booleans for function parameters.
- Blank lines between logical blocks.
- Small, to-the-point comments that say WHAT the block does and WHY. Use examples where helpful. Use ASCII drawings to explain complete systems (README and top of key files).
- Keep all fields and functions private unless external access is strictly required.
- Program to levels of abstraction: raw mechanics (HTTP signing, Workers AI calls, GitHub API, browser control, sandbox loading) live in a `src/drivers/` layer with a clean high-level API; a `src/services/` layer composes drivers into domain operations; the Agent/Workflow classes in `src/` call only services. Never punch through layers (an Agent never calls fetch to GitHub directly).
- Always use `{}` on if statements, even one-liners.
- Avoid superlatives and praise in docs. State the cold truth, including limits and what is not done.
- Short clear sentences in docs (Simplified Technical English style).

### Required repo contents (every prototype)
```
<repo>/
├── README.md            deployed-URL placeholder at the top; four-component checklist table (LLM / coordination / input / memory) mapping to code paths;
│                        ASCII architecture diagram; run instructions (install, test, dev, deploy incl. `wrangler login`); what runs locally vs needs an
│                        account vs needs Workers Paid; honest "Limitations and known gaps" section; "What this proves" table.
├── PROMPTS.md           the AI prompt history for THIS repo. Must be honest. Section 1: the user's original request (quoted in your prompt below) marked
│                        [exact]. Section 2: the builder brief you received, marked [exact] (paste it verbatim: both this common brief and your
│                        prototype-specific prompt). Section 3: a numbered log of the significant sub-decisions and sub-prompts you made while building,
│                        marked [summary], each naming the tool (Claude Code, model claude-fable-5-1) and what the human must still review. Never invent
│                        prompts that were not used. Add a closing note that the author should append their own future prompts here.
├── AGENTS.md            under 200 lines: how to build/test/run, the layering rules above, the deprecated APIs to avoid (from the report section for your
│                        prototype), and the spec ID convention. Also create CLAUDE.md containing one line: `@AGENTS.md`.
├── specs/001-<name>/spec.md   numbered MUST/SHOULD requirements with IDs (for example SLP-001). Each test file names the IDs it covers in a comment.
├── src/                 server.ts (Agent + default export), drivers/, services/, and app/ (minimal React 19 chat UI using useAgentChat from
│                        @cloudflare/ai-chat/react and useAgent from agents/react; keep it small and plain).
├── test/                vitest tests running inside workerd via @cloudflare/vitest-plugin; the specific tests are listed in your prompt.
├── .claude/settings.json      hooks: PostToolUse on Edit|Write runs `npx tsc --noEmit`; Stop runs `npm test` and exits 2 on failure.
├── .claude/rules/<name>.md    path-scoped rules (see your prompt for the content).
├── .claude/agents/reviewer.md read-only reviewer subagent (tools: Read, Grep, Bash(npm test)) that checks the diff against specs/ IDs.
├── .claude/skills/verify/SKILL.md   runs types, tsc, tests, and a wrangler dev smoke request; prints pass/fail.
├── .mcp.json            { "mcpServers": { "cloudflare-docs": { "type": "http", "url": "https://docs.mcp.cloudflare.com/mcp" } } }
├── .github/workflows/ci.yml   npm ci, wrangler types, tsc, vitest.
├── .gitignore           node_modules, .wrangler, dist, .dev.vars, worker-configuration.d.ts (keep generated types out of git)
├── .dev.vars.example
├── wrangler.jsonc, package.json (pin agents 0.33.0 exactly), tsconfig.json, vite.config.ts, vitest.config.ts, index.html
```
Do NOT run `git init` or commit. Do NOT deploy. Do NOT run `wrangler login`.

### Definition of done (verify each, and report the actual command output in your final message)
1. `npm install` clean (list any peer warnings).
2. `npx wrangler types` succeeds.
3. `npx tsc --noEmit` passes with zero errors.
4. `npx vitest run` passes; every listed test exists and passes inside workerd (not in Node).
5. `npx vite build` passes (UI).
6. `npx wrangler dev` starts; a smoke `curl` against the agent route returns 200 with the stub driver; then the process is killed. Use a free port (`--port`) and run it in the background with a timeout; do not leave it running.
7. README, PROMPTS.md, AGENTS.md, CLAUDE.md, specs, .claude/, .mcp.json, ci.yml exist and match the above.
8. `grep -rn "U+2014" --include=*.md --include=*.ts --include=*.tsx --include=*.jsonc .` (excluding node_modules) returns nothing.
If something cannot be made to work (for example a binding unsupported in the test runtime), do not fake it: implement the nearest honest fallback, write it in README "Limitations", and say so in your final report.

### Final report format (your last message)
- Path of the repo folder.
- Table: each definition-of-done item, PASS/FAIL, one line of evidence (the command and its last lines).
- List of files created (tree, no node_modules).
- Any API you found to differ from the research report (name the doc file that is authoritative).
- Anything left undone and why.
```

### 2.3 Resume prompt (second instance, 18 Nov 2026)

```text
You are finishing Prototype 2, "Keyless Code Mode" (cf_ai_keyless_codemode), a Cloudflare Agents SDK project at <workspace>/cf_ai_keyless_codemode. A previous builder instance started it and was stopped mid-build (the user paused to save quota). Partial work is on disk. You continue from it; you do not start over.

FIRST read these files in full, in this order (use cat):
1. <scratchpad>/<session>/scratchpad/builder_prompt_1.md  (the ORIGINAL prototype brief; it is mandatory in full, except that its line "create it; it does not exist" is stale: the folder exists now)
2. <scratchpad>/<session>/scratchpad/BUILDER_BRIEF_COMMON.md  (coding rules, required repo contents, definition of done, final report format; all mandatory)
3. <scratchpad>/<session>/scratchpad/BUILD_RECIPE.md  (verified versions and config files)
Then follow the original brief's reading list (report lines 634 to 834 and 1343 to 1371 via sed -n, the node_modules/agents/docs files, the @cloudflare/codemode package, and the live Dynamic Workers docs via WebFetch).

### State on disk right now (verified at 17:12 today)
Files present: .dev.vars.example, .github/workflows/ci.yml, .gitignore, .mcp.json, CLAUDE.md, index.html, package.json + package-lock.json (node_modules installed), src/drivers/{budget,github,github-stub,github-types,sandbox}.ts, src/server.ts, test/fixtures/github.json, tsconfig.json, vite.config.ts, vitest.config.ts, worker-configuration.d.ts, wrangler.jsonc.
`npx tsc --noEmit` currently FAILS with two errors in src/drivers/sandbox.ts lines 244 and 247: "Property 'dispose' does not exist on type 'SymbolConstructor'" (TS2550). Fix that first (either add the right lib, for example "lib": ["esnext"] in tsconfig compilerOptions, or avoid Symbol.dispose).
Nothing else exists yet: no src/services, no src/gate.ts, no src/app UI, no test/*.test.ts, no README.md, PROMPTS.md, AGENTS.md, specs/, .claude/ folder, .dev.vars. Verify this list against disk with `ls -R` and `cat` before writing anything, and read every existing file before you change or build on it. Keep what is good; the previous instance chose some file names that differ from the original brief's layering list (budget.ts instead of ledger.ts, github-stub.ts, github-types.ts). Either keep those names and make the rest consistent, or rename; do not leave two half-layers.

### Two honesty notes for PROMPTS.md
Section 3 of PROMPTS.md must state that this repo was built by two Claude Code agent instances: the first was stopped mid-build on 18 Nov 2026 when the user paused to conserve quota, and the second (you) resumed from the files on disk with this message as its prompt. Paste this whole message verbatim into section 2 as well, after the original brief and common brief, marked [exact].

### Rules you must not break
Do NOT run git init, git commit, wrangler deploy or wrangler login. Do not spawn subagents. Any `wrangler dev` smoke test runs on a free port in the background with a timeout and is killed afterwards (check with `pgrep -fl wrangler` at the end; nothing of yours may remain running). The GitHub token stays host-side; never pass it into the Dynamic Worker env; globalOutbound must be null. No em dashes anywhere; check with `grep -rn -- "U+2014" . | grep -v node_modules | grep -v /dist/` (quote the pattern so zsh does not expand it).

Work through the full definition of done in the common brief, then finish with the final report format it specifies (repo path; PASS/FAIL table with the command and its last lines for each item; file tree without node_modules; APIs that differed from the research report; anything left undone and why).
```

### 3. Build log: sub-decisions and sub-prompts [summary]

Two Claude Code agent instances (model claude-fable-5-1) built this repository on 18 Nov 2026. The first instance received the briefs in 2.1 and 2.2 and was stopped mid-build when the user paused to conserve quota. It left on disk: package.json with pinned versions, wrangler.jsonc, tsconfig, vite and vitest configs, `.dev.vars.example`, `.gitignore`, `.mcp.json`, `CLAUDE.md`, `.github/workflows/ci.yml`, `index.html`, `src/drivers/{sandbox,budget,github,github-stub,github-types}.ts`, `test/fixtures/github.json` and a five-line placeholder `src/server.ts` used to probe the loopback binding. The second instance received the prompt in 2.3, read every file on disk, kept the first instance's drivers and file names, and built the rest. The numbered items below are the second instance's log; items 1 to 3 describe what it inherited.

1. Inherited from instance one (kept): `src/drivers/sandbox.ts`, a custom `SandboxExecutor` that implements the `@cloudflare/codemode` `Executor` contract, loads a fixed shim as `main.js` and the model's code as `program.js`, passes `env: { GH }` only, `globalOutbound: null` and `limits: { cpuMs }`, counts facade calls and the time to the first call inside the shim. Human review: the shim source string is the security-critical part; read it once.
2. Inherited (kept): `src/drivers/budget.ts`, acorn-based rewriting that inserts `__tick()` into every loop and function body because instance one observed that local workerd does not enforce `limits.cpuMs` (a `while (true) {}` blocked the runtime and the host timer never fired). Instance two fixed one bug in it: arrow functions with a parenthesised expression body such as `(pr) => ({ ... })` produced invalid JavaScript; `preserveParens: true` fixes it. Found by the facade test, not by reading.
3. Inherited (kept): `src/drivers/github.ts`, `github-stub.ts`, `github-types.ts` and the fixtures. Names differ from the original brief's list (`ledger.ts` was planned as a driver; it became a service). Instance two added `repoFromEnv` and widened the type re-exports.
4. Reading before coding: the three brief files, report lines 634 to 834 and 1343 to 1371, `node_modules/agents/docs/{codemode,chat-agents,human-in-the-loop,models,callable-methods,observability,state}.md`, the `@cloudflare/codemode` README and `dist/*.d.ts` (0.5.6 confirmed latest 0.5.x with `npm view`), the three live Dynamic Workers pages via WebFetch, and the generated `worker-configuration.d.ts` for `WorkerLoader`, `ctx.exports` and `LoopbackServiceStub`.
5. First fix: `tsc` failed on `Symbol.dispose` in sandbox.ts. Decision: add `"lib": ["ESNext", "DOM", "DOM.Iterable"]` to tsconfig instead of removing the dispose calls, because releasing the worker stub lets the isolate go away.
6. Probe before design (sub-prompt to itself: "does `env.LOADER` and the loopback binding work under `@cloudflare/vitest-plugin`?"): a throwaway `test/probe.test.ts` showed that `env.LOADER` exists under the plugin, that `state.exports.GitHubGate({ props })` works inside `runInDurableObject`, that inside the isolate `env` has only `GH`, `GITHUB_TOKEN` is `undefined` and `fetch()` throws "This worker is not permitted to access the internet", and that a bare `RpcTarget` in `env` is rejected with `DataCloneError`. Result: all four test files run as vitest-in-workerd unit tests; no HTTP end-to-end fallback was needed. The probe file was deleted.
7. Layering decision: the Agent and the gate call only services. Added `src/services/turn.ts` (composes model driver, sandbox and tools), `src/services/tools.ts` (the two AI SDK tools and the system prompt), `src/services/facade.ts`, `src/services/plan.ts`, `src/services/ledger.ts`. The gate (`src/gate.ts`) calls `createFacade(env)` only.
8. `code` tool decision: `createCodeTool` from `@cloudflare/codemode/ai` over the inherited `SandboxExecutor`, not `DynamicWorkerExecutor`, because the brief requires the loopback `GitHubGate` binding and per-program measurements inside the shim. The facade is passed as a `ToolProvider` with `name: "github"` and a hand-written `types` string (`spec()`), so the model sees output types too. Human review: `spec()` and `PLAN_SPEC` must be kept in step with the zod schemas by hand.
9. Model driver decision: `StubModelDriver` is a `MockLanguageModelV3` from `ai/test` that reads the tool results in the prompt and plays the next move (code tool with `EXAMPLE_PROGRAM`, then `apply_writes` with the returned plan, then text). `scriptedModel()` is exported for tests. `WorkersAiModelDriver` uses `createAI({ binding })` with `@cf/openai/gpt-oss-120b` and was never run against Workers AI (no account). The stub reports fixed token counts; README says so.
10. Ledger decision: `round_trips` is the constant 1 per program run (one model turn produced the program); tokens are attached in `onStepFinish` of the step that produced the program; `isolate_start_ms` is null when a program makes no facade call. SQLite via `ctx.storage.sql` so tests can build a `Ledger` inside `runInDurableObject`.
11. Approval test design: `streamText` with the real tool set and a scripted model, then a second call that replays `response.messages` plus a `tool-approval-response` part. Found by reading `collectToolApprovals` in `ai/dist/index.js` that an approved tool executes before the next model call and its result lands in the model prompt, not in `steps[].toolResults`; the test reads it from `model.doStreamCalls`.
12. Test runtime fix: the `agents/vite` plugin runs Babel on every file containing `@` (including `@cloudflare/...` import strings) and needs `@babel/plugin-proposal-decorators` resolvable from the project root. Added it as a devDependency at the version `agents` itself uses (8.0.2).
13. UI: one `App.tsx` with `useAgent` + `useAgentChat`, Approve/Reject on `approval-requested` parts, and a panel reading `agent.state` (last program, last ledger row). Not covered by automated tests; checked by `vite build` only.
14. Smoke test: `scripts/smoke.sh` runs `wrangler dev --local` (the AI binding is marked `remote: true`; without `--local` wrangler opened a remote session and found two accounts on this machine, which the brief forbids relying on), requests `/agents/coder-agent/smoke/ledger`, got HTTP 200, and kills the process and the esbuild service wrangler leaves behind.
15. Docs: README (components table, two ASCII diagrams, run and deploy steps, what runs where, lineage, what this proves, limitations), `specs/001-keyless/spec.md` (KCM-001 to KCM-010 with traceability), AGENTS.md, `.claude/` (hooks including the `wrangler secret` deny hook, sandbox rule, reviewer agent, verify and release skills).
16. Things the human must still review: the shim in `sandbox.ts` and the gate (security boundary); `spec()`/`PLAN_SPEC` versus the zod schemas; the system prompt wording for a real model (`gpt-oss-120b` was never exercised); the `GitHubApiDriver` against a real repo with a scoped token; whether `limits.cpuMs = 100` is right in production; the no-authentication chat route before any public deploy.

### 4. Closing note

The author should append their own future prompts here, in the same format, each marked [exact] or [summary]. Do not invent prompts that were not used.


## 3. The prototype's spec, verbatim

# Spec 001: Keyless Code Mode

Status: implemented (18 Nov 2026). IDs are stable; tests name the IDs they cover in a header comment.

### Scope

A chat agent whose model writes one JavaScript program against a typed, read-only GitHub facade. The program runs in a fresh V8 isolate (Dynamic Workers, `env.LOADER.load`) with no network. The GitHub token stays on the host behind a loopback `WorkerEntrypoint` (`GitHubGate`). Writes come back as a plan and run only after a human approves the `apply_writes` tool call.

### Requirements

| ID | Level | Requirement |
| --- | --- | --- |
| KCM-001 | MUST | Generated code MUST NOT reach the network. `fetch()` inside the isolate throws. The executor passes `globalOutbound: null` on every load and callers cannot change it. |
| KCM-002 | MUST | The token MUST NOT be readable from the isolate. `env.GITHUB_TOKEN` is undefined inside the isolate; the only binding passed is the loopback `GH` facade; no global and no returned value contains token bytes. The gate exposes READ methods only, so even a direct `env.GH.<write>` call is rejected. |
| KCM-003 | MUST | Writes MUST require human approval. `apply_writes` carries `needsApproval: true`; a denied call executes nothing and the model receives `execution-denied`; an approved call executes through the host-side GitHub driver. |
| KCM-004 | MUST | The ledger MUST record, per program run: facade calls made inside the one program, model round trips that produced it (1), isolate start milliseconds (`load()` to the first facade call, null when none), and tokens in/out from the AI SDK step usage when available. |
| KCM-005 | MUST | A runaway program (infinite loop, unbounded recursion, never-resolving promise) MUST be stopped by the CPU limit, the iteration budget or the outer timeout, and reported as an error. The agent never hangs. |
| KCM-006 | MUST | The GitHub driver MUST sit behind an interface with a real implementation (fetch to api.github.com, token from `env.GITHUB_TOKEN`) and a fixture-backed stub, selected by `GITHUB_DRIVER = "github" \| "stub"` (default stub). Tests and local dev need no token. |
| KCM-007 | MUST | The model MUST sit behind a driver: `WorkersAiModelDriver` (`createAI` from `agents/models/ai-sdk`, `@cf/openai/gpt-oss-120b`, alternative `@cf/meta/llama-3.3-70b-instruct-fp8-fast`) and `StubModelDriver` that returns a fixed, valid program for the facade, selected by `MODEL_DRIVER = "workers-ai" \| "stub"` (default stub). |
| KCM-008 | MUST | Chat MUST go through `AIChatAgent` with tools `code` (from `createCodeTool` of `@cloudflare/codemode/ai` over an `Executor` that wraps `env.LOADER`) and `apply_writes`, with `stopWhen: stepCountIs(6)`. |
| KCM-009 | SHOULD | Every facade call SHOULD validate its input on the host before touching the driver, because the input comes from generated code. |
| KCM-010 | SHOULD | The UI SHOULD show the last generated program and its ledger row next to the chat, and Approve/Reject buttons for `apply_writes`. |

### Traceability

| ID | Evidence |
| --- | --- |
| KCM-001 | `test/exfiltration.test.ts`; `src/drivers/sandbox.ts` (`globalOutbound: null`, not configurable) |
| KCM-002 | `test/exfiltration.test.ts`; `src/gate.ts` (read methods only); `src/drivers/sandbox.ts` (`env: { GH }` only) |
| KCM-003 | `test/approval-gate.test.ts`; `src/services/tools.ts`; `src/services/plan.ts` |
| KCM-004 | `test/ledger.test.ts`; `src/services/ledger.ts`; `src/server.ts` (`onStepFinish` attaches usage) |
| KCM-005 | `test/exfiltration.test.ts`; `src/drivers/budget.ts` (tick budget); `src/drivers/sandbox.ts` (`limits.cpuMs`, timeout) |
| KCM-006 | `test/facade.test.ts`; `src/drivers/github.ts`, `github-stub.ts`, `test/fixtures/github.json` |
| KCM-007 | `src/drivers/model.ts`; exercised by `test/approval-gate.test.ts` (scripted model) and `wrangler dev` with the stub |
| KCM-008 | `src/server.ts`, `src/services/tools.ts`; `test/facade.test.ts` ("code tool ... end to end") |
| KCM-009 | `test/facade.test.ts` ("rejects malformed input") |
| KCM-010 | `src/app/App.tsx` (manual check in the browser) |

### Out of scope

- Approval inside the sandbox (the codemode runtime's connector approvals). The program only plans; `apply_writes` is a normal AI SDK tool.
- More than one repository per agent. `GITHUB_REPO` is fixed in config.
- Write kinds other than comment, close pull request, close issue.
