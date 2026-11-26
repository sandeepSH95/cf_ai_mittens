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
