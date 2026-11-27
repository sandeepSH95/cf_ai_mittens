# Open work

Work that is not done. Faults in what exists are in [KNOWN_ISSUES.md](KNOWN_ISSUES.md). This file is for work that was not started.

## Never run

| Item | State |
| --- | --- |
| A deployment | The commands are in the README. Nobody has run them for this project. Dynamic Workers must be available on the account. |
| The live-model check on a second model | Three checks ran, all on `@cf/openai/gpt-oss-120b` with one request. The system prompt is tuned to that model. |
| The failure paths of `tools/live-check.mjs` | Each predicate was seen to pass and, in the first live check, two were seen to fail. `reads_only` and `no_breach` were never seen to fail. |

## Tests that do not exist

| Item | Why it matters |
| --- | --- |
| An attack through `cloudflare:sockets`, a WebSocket or `env.GH.fetch` | The eight attacks cover `fetch`, the env, a write call and four runaway shapes. These three doors were read in a review and not attacked by a program. |
| A CPU burn with no loop | Known issue KI-004. A test would hang the local runtime, so it needs the production CPU limit. |
| Two programs in one model step | Known issue KI-009. |
| Unit tests inside `packages/mittens_sandbox` and `packages/mittens_attack` | Both are tested through the gold cases and the demo's tests only. `applyBudget` has no test of its own. |

## The experiment this project does not yet make

The attack suite has one control: a copy of the sandbox with the token in its environment. That shows that the attacks are real. It does not compare the design with what agents do today.

| Item | What it would show |
| --- | --- |
| An injection suite: hostile text in the fixture repository (an issue body, a comment), run through a live model | How often the model follows the injected text, and whether a write or a leak follows. The result is a rate, not a pass or a fail. |
| Baselines for that suite: plain tool calling with the token in the tool, tool calling with an approval per call, Code Mode with no gate, a read-only token | Whether this design contains an injection that the common designs do not. |

## Small clean-up

| Item | Where |
| --- | --- |
| The same constants in several files: tool names, routes, part states | `src/app/chat/constants.ts`, `services/denial.ts`, `testing.ts`, `server.ts`, `drivers/agent-client.ts` |
| Magic strings: `"closed"`, `"mittens[bot]"` | `drivers/github.ts`, `drivers/github-stub.ts` |
| Two members that are public only for tests | `Ledger.latest()`, the counters of `StubGitHubDriver` |
| `defineWrites` names the field `body` and the word "comment" | `packages/mittens_gate/src/writes.ts`. A generic function should take these from its caller. |
| The chart script fails on an empty ledger | `tools/ledger-chart.mjs` |
| Some dependency versions are ranges, next to exact ones | `apps/mittens_demo/package.json`. Only `agents`, `ai` and `zod` are pinned by rule. |
