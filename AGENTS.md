# Mittens

Mittens for AI agents: read anything, touch nothing, ask before you write.

A chat agent on Cloudflare where the model writes one JavaScript program per task. The program runs in a Dynamic Worker with no network and no secret. Reads cross a typed, read-only gate. Writes come back as a plan that a human approves.

The current step and the full design are in `docs/PLAN.md`. Read it before you start.

## How the work is judged

A deterministic verifier compares the build with a signed gold set. Your opinion of your own work does not count: the exit code does.

```
criteria/*.md --> gold/cases/*.json --> sh verify/run.sh --> exit code
  (the rules)      (expected values)     (inside workerd)
```

| Exit | Meaning | What you do |
| --- | --- | --- |
| 0 | every case passes | stop |
| 1 | a case fails | read the diff it prints, fix the package |
| 3 | a fenced file changed | undo your change, then stop and report |
| 4 | criteria or gold set incomplete | stop and report, a human owns them |
| 5 | the verifier crashed | stop and report |

## Commands

| Purpose | Command |
| --- | --- |
| Install | `npm install` |
| Typecheck the packages | `npm run typecheck` |
| Package tests inside workerd | `npm test` |
| The verifier | `sh verify/run.sh` |
| Typecheck and self-tests of the verifier, loop and hooks | `npm run typecheck:verify && npm run test:verify` |
| Lint one gold case draft | `node verify/lint-case.ts gold/drafts/G-050.json` |
| One loop run (human) | `sh loop/loop.sh` |
| Record a pass by hand (human) | `sh loop/record.sh <pass> <exit-code>` |
| Demo, offline | `npm run build -w apps/mittens_demo && npm run dev -w apps/mittens_demo` |

## Layout

| Path | What | Who writes |
| --- | --- | --- |
| `packages/mittens_sandbox` | runs a program in a Dynamic Worker: no network, tick budget, timeout | builder |
| `packages/mittens_gate` | `defineReads`, `defineWrites`, the approval tool | builder |
| `packages/mittens_attack` | `attackSandbox`: attack programs against any executor | builder |
| `apps/mittens_demo` | the agent, the gate entrypoint, drivers, the page | builder |
| `verify/runner/CONTRACT.md` | the public API the packages must have | human, fenced |
| `criteria/`, `gold/cases/`, `fixtures/`, `verify/`, `loop/` | the rules, the expected values, the verifier, the loop | human, fenced |
| `.claude/hooks/`, `.claude/agents/`, `.claude/settings.json` | the hooks and the reviewer | human, fenced |
| `gold/drafts/` | proposals for new cases | agent |
| `ledger/` | `last-run.json`, `iterations.jsonl` | scripts only |
| `HANDOFF.md` | what the last pass did and suspects, under 40 lines | builder |
| `prompts/` | the prompt record | the interactive agent |

## Boundaries

1. Do not change a fenced path. A hook refuses the call with `fenced path: <path>. Stop and report.` The manifest check then catches what a hook misses: exit 3.
2. Do not read `../mittens_holdout`. It is the held-out set.
3. Do not special-case the input of a gold case. Implement the criterion.
4. Do not run `wrangler deploy`, `wrangler login`, `wrangler secret` or `git push`. A human does these.
5. No secret in the Dynamic Worker `env`, in a fixture, in a log or in a document. The GitHub token stays on the host, in `.dev.vars` or a Worker secret.
6. If a case looks wrong, write why in `HANDOFF.md` and move on. Do not edit the case.
7. Do not write to `ledger/iterations.jsonl`. `loop/record.sh` does.

## Code rules

- Constants or const objects for meaningful values. No TypeScript `enum`: Node runs the verifier by stripping types.
- A const object for a function parameter, not a boolean.
- Early return. Braces on every `if`. Function names under 30 characters.
- Members stay private unless the contract names them.
- Drivers hold the raw mechanics (Worker Loader, GitHub REST, the model). Services call drivers. The agent calls services. No layer skips its neighbour.
- A small comment per block: what it does and why, with an example when one helps.
- No em dashes, in code or in text.
- Change only the lines the task needs.

## Commits

Use the template in `.gitmessage`. Subject in the imperative, 50 characters, capital first letter, no period. Body wrapped at 72 columns, with the verifier's exit code and case counts before and after.

## Gotchas

- Local workerd does not enforce `limits.cpuMs`. A `while (true) {}` in a Dynamic Worker blocks the local runtime. The tick budget in `mittens_sandbox` exists for this.
- A bare `RpcTarget` cannot go in a Dynamic Worker `env`. A loopback handle from `ctx.exports` can.
- An `ai` binding makes `wrangler dev` open a remote session. Keep it in `env.production`, or use `wrangler dev --local`.
- The `agents/vite` plugin is needed for decorators, with `@babel/plugin-proposal-decorators`.
- Use `@cloudflare/vitest-plugin`. `@cloudflare/vitest-pool-workers` is deprecated.
- The runtime's RPC error text differs between production and the test runtime. Do not compare it; test the behaviour.
- `agents`, `ai` and `zod` are pinned to exact versions. Do not loosen them.
- zsh expands `--include=*.md` in grep. Quote it.
