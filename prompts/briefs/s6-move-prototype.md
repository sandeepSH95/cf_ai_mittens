# Brief: step S6, move the prototype into packages

Issued 25 November 2026 by the coordinator agent (Claude Code, claude-fable-5-2) to a builder subagent.

## Where you are

Repository root: `<repo>`. The prototype, which you read and never modify: `<workspace>/cf_ai_keyless_codemode/`.

Do not run `git add`, `git commit` or `git push`. Do not create or change anything under `criteria/`, `gold/`, `verify/`, `loop/`, `fixtures/`, `docs/` or `prompts/`. Do not run `wrangler login`, `wrangler deploy` or `wrangler secret`. You write only under `packages/`, `apps/`, and the root `package.json`, `package-lock.json` and a new root `tsconfig.base.json`. Leave the root `tsconfig.json` as it is (it belongs to the verifier).

Read first: `docs/PLAN.md` sections 0 to 5, the step S6 section, and section 11 (gotchas). Then the prototype's `README.md`, `package.json`, `wrangler.jsonc`, `vitest.config.ts`, `tsconfig.json`, all of `src/` and all of `test/`.

## What to do

Move the prototype's code into four npm workspaces with NO behaviour change. This step proves the module boundary; it does not build the new public APIs in `criteria/` (a later loop does that).

- `packages/mittens_sandbox`: `src/drivers/sandbox.ts`, `src/drivers/budget.ts`.
- `packages/mittens_gate`: `src/services/facade.ts`, `src/services/plan.ts`, `src/services/tools.ts`, and whatever driver types they need. If the facade's dependency on the GitHub driver forces a choice, keep the driver interface and types in `mittens_gate` and the implementations (REST and stub) in the demo app.
- `packages/mittens_attack`: the canary constant, the malicious programs of `test/exfiltration.test.ts` as exported data, and a reusable helper that runs them against any `{ run(code) }` executor and returns the outcomes. The exfiltration test itself moves to the workspace that can run it inside workerd (the demo app, which has the Worker Loader binding and the Durable Object) and imports the helper by package name.
- `apps/mittens_demo`: the agent (`server.ts`), the gate entrypoint, the GitHub driver implementations, the model driver, the ledger, `turn.ts`, the React UI, `wrangler.jsonc`, `index.html`, fixtures and the remaining tests.

Rules:

- Each workspace has `package.json` (`"type": "module"`, `"private": true`, `exports` pointing at TypeScript source, a `typecheck` script, and a `test` script where it has tests), and a `tsconfig.json` extending `../../tsconfig.base.json`.
- Workspaces import each other by package name (`mittens_sandbox`, `mittens_gate`, `mittens_attack`), never by a relative path that leaves the workspace. Declare the dependency in `package.json` with `"*"`.
- Pin the same dependency versions the prototype uses (`agents` 0.33.0 exactly; see the prototype's `package.json`). The root already has `vitest` 5.1.1, `@cloudflare/vitest-plugin` 1.8.4 and `wrangler` 4.164.0 as dev dependencies; keep them.
- All 30 prototype tests must exist and pass inside workerd, each in the workspace that owns what it tests or in the demo app when it needs the bindings.
- Coding rules: no em dashes anywhere; constants for meaningful values; early returns; braces on every if; keep comments that exist, adjust only paths in them; do not refactor beyond what the move needs.
- Do not run `wrangler dev`. Do not start servers.

## Done when

Run each and paste the last lines and the exit code in your report:

1. `npm install` at the root: no errors.
2. `npm run typecheck` at the root: exit 0 in every workspace.
3. `npm test` at the root: every moved test passes; state the count per workspace; the total is 30.
4. `grep -rn "from \"\.\./\.\./" apps packages --include='*.ts' --include='*.tsx' | grep -v node_modules`: prints nothing.
5. `npm run -s typecheck:verify && npm run -s test:verify`: still exit 0 (the verifier's own checks are untouched).

## Report, your last message

1. The tree of the four workspaces (no node_modules).
2. Each check above: command, last lines, exit code.
3. Every place you had to decide where a file belongs, one line each.
4. Anything that does not work and why. Do not hide a failing test.
