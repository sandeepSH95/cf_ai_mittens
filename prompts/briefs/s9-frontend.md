# Brief: step S9, the demo page with shadcn styling

Issued 26 November 2026 by the coordinator agent (Claude Code, claude-fable-5-2) to a frontend builder subagent.

## Where you are

Repository root: `<repo>`. You work only in `apps/mittens_demo` (its `src/app/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, a new `components.json`) and the root `package-lock.json`.

Do not change: `criteria/`, `fixtures/`, `gold/`, `verify/`, `loop/`, `.claude/`, `docs/`, `prompts/`, `packages/`, and in the app `src/server.ts`, `src/gate.ts`, `src/services/`, `src/drivers/`, `src/testing.ts`, `test/`. Do not run `git add`, `git commit`, `git push`, `wrangler deploy`, `wrangler login` or `wrangler secret`. Do not read `../mittens_holdout`.

Read first: `AGENTS.md` (code rules), `apps/mittens_demo/src/app/App.tsx` (the current page, inline styles), `apps/mittens_demo/src/services/attack-run.ts` (the API the new page calls), `apps/mittens_demo/src/server.ts` (the `CoderState` type and the routes).

## What to build

Replace the inline-style page with a page in shadcn/ui styling: Tailwind CSS v4 (the `@tailwindcss/vite` plugin), the shadcn "new-york" look with its CSS variables (neutral base colour, light and dark by `prefers-color-scheme`), and shadcn component files under `src/app/components/ui/` (at least button, card, badge, tabs, table, input; add what you need). Write the component files as shadcn ships them (Radix primitives, `class-variance-authority`, a `cn()` helper in `src/app/lib/utils.ts`). Add `components.json` so `npx shadcn add` works later. Use the path alias `@/` for `src/app/` in Vite and in the tsconfig. Icons: `lucide-react`.

Pin every new dependency to an exact version (no `^`), the latest stable one that `npm view <name> version` reports.

The page has two tabs. The first tab is the default.

### Tab 1: Attack (the main screen)

Purpose: show, before any explanation, that eight real attacks fail against the Mittens sandbox and that the same attacks find the token in a naive executor.

- A short headline and one sentence: the same eight attack programs run against two executors; the only difference is that the naive one has the API token in the isolate's env.
- One primary button, "Run the 8 attacks". It calls `GET /api/attacks/mittens` and `GET /api/attacks/naive` in parallel. Show a loading state while they run (about one to three seconds). Show a readable error state if a call fails.
- Two cards side by side (stacked on a narrow screen): "Mittens sandbox" and "Naive executor (token in env)". Each card shows a summary badge ("0 of 8 breached" in a calm success style, "1 of 8 breached" in the destructive style), the duration in ms, and a table with one row per attack: name, criterion id, outcome badge ("held" or "breached"), detail text.
- A row can be opened to show the attack program's source (`code`) in a monospace block.
- Before the first run the cards show the eight attack names with a neutral "not run" state, so the page is not empty. Fetching nothing on load is fine: keep the names in a constant, or run on first click only.

The response shape of each call (`AttackRun` in `src/services/attack-run.ts`):

```ts
{ target: "mittens" | "naive"; breached: number; durationMs: number;
  cases: Array<{ name: string; outcome: "held" | "breached"; detail: string; criterion: string; code: string }> }
```

Import the types from `../services/attack-run` with `import type` only, so no server code enters the browser bundle.

### Tab 2: Chat

The existing chat, restyled with the same components, with no behaviour change: the message list, tool parts (`code` shows the program, `apply_writes` shows the plan with Approve and Reject buttons while the state is `approval-requested`), the input form, the Clear button, and the side panel with the last program and the ledger row. Keep every hook call and every state name of the current `App.tsx`. A note under the title says the demo runs with stub drivers by default: a scripted stub model and a fixture repository, no account needed.

## Rules

- Follow the code rules in `AGENTS.md`: constants for meaningful values, a const object and not a boolean for a function parameter, early return, braces on every `if`, function names under 30 characters, a small what and why comment per block, no em dashes anywhere, blank lines between logical blocks.
- Split the page into small files: `src/app/App.tsx` (the tabs), `src/app/attack/` and `src/app/chat/` for the two tabs, `src/app/components/ui/` for shadcn components. The components call the API through one small client module (for example `src/app/attack/api.ts`), not with `fetch` inline in a component.
- Accessible: real buttons, table headers, visible focus, colour is never the only signal (the badge has text).
- No new runtime dependency beyond what shadcn components need.

## Done when

Run each from the repository root and paste the last lines and the exit code in your report:

1. `npm install`: no errors.
2. `npm run typecheck -w apps/mittens_demo`: exit 0.
3. `npm run build -w apps/mittens_demo`: exit 0, `dist/` is built.
4. `npm test -w apps/mittens_demo`: every test passes (56 before your change, plus 4 in `test/attack-page.test.ts`).
5. `grep -rn "—" apps/mittens_demo/src/app apps/mittens_demo/index.html`: prints nothing.
6. `grep -rn "\"\\^" apps/mittens_demo/package.json`: list which carets were there before you and confirm you added none.

## Report, your last message

1. The tree of `apps/mittens_demo/src/app`.
2. Each check above: command, last lines, exit code.
3. Every dependency you added, with its exact version.
4. Anything that does not work and why. Do not hide a failing check.
