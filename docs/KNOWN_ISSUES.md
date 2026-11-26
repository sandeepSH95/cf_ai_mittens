# Known issues

Open items that the first version accepts. Each one has a decision and what a later version must look at.

## KI-001: `mittens_sandbox` counts gate calls inside the isolate

Logged 26 November 2026. Status: open, for future investigation.

```
                 isolate (untrusted program)              host
                +---------------------------+     +------------------+
 github.x() --> | shim: facadeCalls += 1    | --> | gate --> driver  |
                +---------------------------+     +------------------+
 env.GH.x() ----------- no shim, no count ------> | gate --> driver  |
```

What happens: `execute(program)` of `mittens_sandbox` returns `facadeCalls` and `isolateStartMs`. Both numbers come from the shim that runs inside the isolate, next to the program. A program that uses the raw gate handle (`env.GH`) makes a read that the shim does not count. A program can also replace `Date.now` before its first call.

What the first version does: the demo does not trust these two numbers. The gate reports each read to the agent on the host (`apps/mittens_demo/src/services/gate-meter.ts`), and the ledger uses that count. Gold case G-047 proves it: one read through the raw handle gives `facade_calls` 1.

What stays open: a caller of `mittens_sandbox` alone, without the demo's meter, still gets the count of the untrusted side. `createSandbox` has no host entrypoint of its own, so it cannot count on the host today.

To investigate:

- Can the sandbox wrap the gate handle on the host and count there, inside the Workers RPC limits (a bare `RpcTarget` cannot go in a Dynamic Worker `env`)?
- Or must `facadeCalls` and `isolateStartMs` leave the result of `execute`, with the count moved to the gate package as a documented duty of the host?
- Criterion SBX-005 names both fields. A change needs a new criterion text and new gold cases first.

## KI-002: the host-side count costs one RPC per read

Logged 26 November 2026. Status: accepted for the first version.

Each read through the gate makes two more RPCs to report the call: the lookup of the agent by name, then `CoderAgent.countGateCall`. (The first note said one; the second review counted two.) The author accepted the cost for the first version. A later version can count in a batch, or count in the gate and report once per run.

`countGateCall` is a public method, because Durable Object RPC cannot call a private one. The author approved it on 26 November 2026 on one condition: proof that a browser client cannot call it. `apps/mittens_demo/test/client-reach.test.ts` is that proof. It sends the client's RPC frame over a real WebSocket and expects the SDK's refusal, and it fails when the method is marked `@callable`.

A read whose count call throws does not run. Three paths still let a read run with no count: a gate handle with no scope, an agent with no meter, and a run id that does not match. The demo's live path always sets all three.

## KI-003: three attack programs can report a false "held"

Logged 26 November 2026, from the second review (`prompts/briefs/s8-review-2.md`). Status: open.

| Attack | How it can miss a breach |
| --- | --- |
| swallowed fetch | A fetch that leaves the isolate and then fails on the network (host offline, DNS error) is reported as "not reached". The request still left. |
| direct write call | Only `createComment` is tried. A gate with another write method is not seen. |
| env inspection | The program looks at the keys of `env` and leaves the value of the gate binding out of its result. A token placed under that key is not seen. |

To investigate: a fetch target that the test controls, so "left the isolate" is observed and not inferred; a list of write names, or a probe of every property of the gate handle; a deep scan of every `env` value.

## KI-004: work inside a built-in has no tick

Logged 26 November 2026, from both reviews. Status: open.

The tick budget counts loop bodies and function bodies (`packages/mittens_sandbox/src/budget.ts`). One call of a built-in can do unbounded work with no tick: `"x".repeat(n)`, `Array.from({ length: 1e8 }, Math.random)`, a regular expression with heavy backtracking. In production `cpuMs` stops such a program. Local workerd does not enforce `cpuMs`, so a local run can block.

To investigate: a size check on the arguments of the known heavy built-ins, a refusal of regular expression literals with nested quantifiers, or a documented statement that the tick budget is a local aid and `cpuMs` is the real limit.

## KI-005: a read can run with no count on three fallback paths

Logged 26 November 2026, from the second review. Status: open.

The gate reports each read to the agent's meter. A read still runs, with no count and no error, when the gate handle has no scope, when the agent has no meter, or when the run id does not match. The demo's live path sets all three, and gold case G-047 covers it. The handle with no scope is also what the testing entry's `openGate()` returns by contract, so "refuse every read that cannot be counted" would break that contract. A fix needs a contract change first: a gate handle that states if it is metered.

## KI-006: an approval is not bound to one plan by a signature

Logged 26 November 2026, from the second review. Investigated the same day by reading the chat SDK. Status: accepted for the first version, inside the threat model.

What is true: the chat protocol trusts the client for the message history. A client can send its whole message list and the agent stores it (`@cloudflare/ai-chat`, the `persistMessages` calls for incoming messages). After an approval the SDK takes the plan from that stored history. So a client can replace the plan of a pending approval with another plan. The AI SDK has an option that signs an approval for one input, and the build does not use it.

Why the first version accepts it: the client is the human who approves. The parties the design does not trust are the model, the generated program and the data the program reads. None of them can write to the stored history between the approval request and the answer. A plan that a client swaps in is still validated in `execute` (kinds, the 25 write limit, the comment length) before any write.

What stays open: a script injected into the page acts as the human. That is the browser's threat model, not this project's, but a later version can close it: sign the approval, or keep the plan of the last program on the host and apply only that plan. The second choice also binds a plan to a program run, which the first review named.

## KI-007: a read that a program does not wait for

Logged 26 November 2026, from the second review. Investigated the same day with an experiment. Status: not reproduced, no change.

The concern: a program starts a read, does not await it and returns. The read could arrive after the meter was read, and land in no ledger row or in the row of the next program.

The experiment, in the test runtime: a program fired two reads with no `await` and returned. In a second run a quiet program followed it in the same turn. Result in both runs: the stub received 0 reads and the ledger row had `facade_calls` 0. The isolate ends with the program, and its pending calls end with it. The count and the driver agreed, and the next program's row was not changed.

Limit of the experiment: one run of each shape, local runtime only. The order of an isolate's end and a pending RPC is not a documented guarantee.
