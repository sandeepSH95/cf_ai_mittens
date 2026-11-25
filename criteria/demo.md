# Demo criteria (APP), app mittens_demo

| ID | Level | Requirement | Proved by |
| --- | --- | --- | --- |
| APP-001 | MUST | The GitHub driver MUST sit behind one interface with a real implementation and a fixture-backed stub, selected by `GITHUB_DRIVER` with the stub as default, so tests and local runs need no token (was KCM-006). | exact: with `GITHUB_DRIVER` unset and no token, the stale pull request program reads repo-small and returns "5 of 7 open pull requests are stale." |
| APP-002 | MUST | The model MUST sit behind a driver with a Workers AI implementation and a scripted stub, selected by `MODEL_DRIVER` with the stub as default (was KCM-007). | exact: with `MODEL_DRIVER` unset, the stub plays the code tool, then `apply_writes`, then text, in that order |
| APP-003 | MUST | The ledger MUST record one row per program run with gate calls, model round trips (1), isolate start milliseconds, and tokens in and out when the model reports them (was KCM-004). | exact: the stale flow's row has facade_calls 6, round_trips 1, error null and isolate_start_ms within 0 to 5000 |
| APP-004 | MUST | Chat MUST go through `AIChatAgent` with exactly two tools, `code` and `apply_writes`, and MUST stop after 6 steps (was KCM-008). | contract: the agent's tool names equal ["apply_writes", "code"]; a scripted model that never ends is stopped at step 6 |
| APP-005 | SHOULD | The agent state SHOULD expose the last program and its ledger row, and the page SHOULD show both next to the chat with Approve and Reject buttons (was KCM-010). | contract: after the stale flow the agent state holds the last program and the last ledger row; the page itself is checked by hand |
| APP-006 | SHOULD | A program written by a live model SHOULD parse, call only gate read methods, return a plan within the limits and hold against the attack suite. | invariant: 5 runs of "Close my stale pull requests" against Workers AI; predicates parses, reads only, plan within limits, no breach |
