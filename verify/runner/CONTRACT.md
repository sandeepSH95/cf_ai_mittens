# CONTRACT: what the packages must provide to the verifier

The adapter (`verify/runner/adapter.ts`) runs every gold case against the packages, by package name, inside workerd. This file lists every export it reads. Nothing else is read. A missing or wrong-shaped export fails the case with one line that starts with `contract: `.

```
gold case --> adapter --> mittens_sandbox   createSandbox
                     |--> mittens_gate      defineReads, defineWrites
                     |--> mittens_attack    attackSandbox
                     +--> mittens_demo/testing   openGate, agentParts, runScriptedCase
                              (the seam: the real agent, with the model and
                               the GitHub driver replaced, nothing else)
```

## 1. Environment

The cases run in the worker that `apps/mittens_demo/wrangler.jsonc` describes. The adapter needs:

| Binding | Use |
| --- | --- |
| `LOADER` (Worker Loader) | passed to `createSandbox` as `loader` |
| `GITHUB_TOKEN` | set by the runner to the canary. The host holds it; no program may see it |

The file `apps/mittens_demo/wrangler.jsonc` must stay at that path and must load without a Cloudflare account (`remoteBindings` is off). `mittens_attack/canary` may export `CANARY_GITHUB_TOKEN` (a string); the runner uses it as the canary when it is there.

## 2. Exports defined by the criteria

| Export | Signature | Returns | Serves |
| --- | --- | --- | --- |
| `mittens_sandbox` `createSandbox` | `createSandbox({ loader, gate, tickBudget?, timeoutMs?, cpuMs? })` | a plain object whose only own key is `execute`. Throws a `TypeError` on any other key. | SBX-001 to SBX-005, GATE-001, ATK-003 |
| `execute` | `execute(program: string)` | a promise of `{ result, error, facadeCalls, isolateStartMs }`. All four keys are present. It never rejects. `error` is a string or null. | SBX-003, SBX-005 |
| `mittens_gate` `defineReads` | `defineReads({ [method]: { input, output, handler } })` | `{ facade, spec }`; `spec()` returns the declaration text. Throws a `TypeError` when an entry lacks one of the three keys. | GATE-005 |
| `mittens_gate` `defineWrites` | as GATE-006 states it: a map from write kind to `{ input, apply }`, plus `limits`. The adapter does not call it. | `{ planSpec, validatePlan, applyWritesTool }`, exactly these own keys. `planSpec()` returns the plan declaration text. `applyWritesTool.needsApproval` is `true`. | GATE-006 |
| `mittens_attack` `attackSandbox` | `attackSandbox({ execute, canary })` | a promise of `{ cases, breached }`. `cases` is a list of `{ name, outcome, detail }`, one per attack, in the order of ATK-002. `outcome` is `"held"` or `"breached"`. `breached` is the number of breached cases. Throws or rejects with a `TypeError` when `execute` is not a function. | ATK-001, ATK-002, ATK-003 |

Details the adapter depends on:

- `createSandbox` is called as `createSandbox({ loader: env.LOADER, gate: openGate(), ...input.options })`. The options of a case are passed as they are.
- The missing-key check of `defineReads` runs before any check of the values. The adapter passes `{}` for `input` and `output` and an async function for `handler`, then removes the key the case names.
- The adapter never calls `defineWrites`. It checks that the export is a function, then reads the value the agent uses (section 3, `agentParts().writes`).
- `attackSandbox` calls `execute(program)` and nothing else on the executor. The adapter passes three executors:
  - the real sandbox, built with `tickBudget` 10000 and `timeoutMs` 500;
  - an inert executor that runs nothing and resolves to `{ result: null, error: null, facadeCalls: 0, isolateStartMs: null }` (used to read the report's shape and the attack names);
  - a leaky executor that runs nothing. When the program text matches `Object.keys(env`, `Object.values(env` or `Object.entries(env`, it resolves with `result: { envKeys: ["GH", "GITHUB_TOKEN"], env: { GITHUB_TOKEN: <canary> } }`. For every other program it is inert. So the env inspection attack must list env that way, and no other attack may.
- The canary passed to `attackSandbox` is the value of `env.GITHUB_TOKEN`.

## 3. The testing entry: `mittens_demo/testing`

The criteria do not define these three functions. They exist so a case can run the agent with a scripted model, a fixture and a fixed clock. Add `"./testing"` to the `exports` of `apps/mittens_demo/package.json`.

The rule for this entry: it MUST run the real agent code path. The real `CoderAgent`, the real sandbox, the real gate, the real plan validation and the real ledger. It replaces two things only: the model (by the script) and the GitHub driver (by a stub over the fixture). It must not compute a report value that the agent path did not produce.

### `openGate(source?)`

```ts
openGate(source?: { fixture: string; now: string }): GateHandle
```

Returns the gate handle that `createSandbox` takes as `gate`: the loopback handle from the worker's `exports`, with read methods only. With no argument the gate is backed by the demo's default stub driver (`GITHUB_DRIVER` unset). With `source`, it is backed by the fixture text, and the stub turns "days ago" into dates from `now`. Serves SBX-001 to SBX-004, GATE-001, ATK-003.

### `agentParts()`

```ts
agentParts(): { reads: object; writes: object; toolNames: string[]; stepLimit: number }
```

| Key | Value | Serves |
| --- | --- | --- |
| `reads` | the `{ facade, spec }` the agent got from `defineReads` for the GitHub reads | GATE-005 |
| `writes` | the `{ planSpec, validatePlan, applyWritesTool }` the agent got from `defineWrites` | GATE-006 |
| `toolNames` | the names of the tools the agent gives to the model | APP-004 |
| `stepLimit` | the step count at which the agent stops a turn; the same constant the agent uses | APP-004 |

### `runScriptedCase(input)`

```ts
runScriptedCase(input: {
  agentName: string;            // the agent instance to use; a new name per case
  fixture: string;              // JSON text of a file in fixtures/
  now: string | null;           // ISO 8601; the stub's clock. null: the real clock
  userMessage: string | null;
  script: Array<
    | { tool: "code"; program: string }   // program text, not a path
    | { tool: "apply_writes" }            // the plan of the last program result
    | { text: string }
  >;
  approval: "approve" | "reject" | null;  // the human's answer to apply_writes
}): Promise<Report>
```

Sends `userMessage` to the agent named `agentName`. The scripted model plays one step per model call, in order. When `apply_writes` asks for approval, the entry answers with `approval`. The promise resolves when the turn has ended.

The report. Every key is always present. The runner compares only the keys a case expects, and compares each of those whole.

| Key | Value | Serves |
| --- | --- | --- |
| `program_result` | the value the last program returned, or null | APP-001, GATE-004, SBX-005 |
| `plan` | the `plan` of the last program result, `{ writes: [...] }`, or null when it has none | GATE-002 |
| `ledger` | the last ledger row as exactly `{ facade_calls, round_trips, error, isolate_start_ms }`, or null when no program ran | APP-003, SBX-005 |
| `apply_outcome` | `{ applied: <count>, failed: <count> }` after an approved plan ran, else null | GATE-002, GATE-003 |
| `stub_writes` | the writes the GitHub stub received, in order, each in the shape of a plan write (`{ kind, number, body? }`) | GATE-002, GATE-003 |
| `refusal` | the message of the plan validation when it refused the plan, else null | GATE-003 |
| `model_received` | the `output.type` of the `apply_writes` tool result in the last prompt the model received (`"execution-denied"` after a reject), or null when there is none | GATE-002 |
| `driver_calls` | the number of read calls that reached the GitHub stub | GATE-004 |
| `agent_state` | `{ last_program, last_ledger, runs }` from the agent's state after the turn: the last program text, its ledger row in the shape of `ledger`, and the number of program runs | APP-005 |

`last_program` must equal the program text of the script; only white space at both ends may differ.

## 4. The contract calls

`input.call` selects one entry of `verify/runner/registry.ts`. A key list is returned sorted. A thrown error is returned as `{ throws: <error name>, message: <message> }`.

| Call | What the adapter does |
| --- | --- |
| `sandbox.createSandbox.keys` | sorted own keys of `createSandbox({ loader, gate })` |
| `sandbox.createSandbox.badOption` | `createSandbox({ loader, gate, ...args })`, the thrown error |
| `gate.defineReads.spec` | `agentParts().reads.spec()` |
| `gate.defineReads.missingInput` | `defineReads({ [args.method]: <entry without args.missing> })`, the thrown error |
| `gate.defineWrites.keys` | sorted own keys of `agentParts().writes` |
| `gate.defineWrites.planSpec` | `agentParts().writes.planSpec()` |
| `gate.defineWrites.needsApproval` | `agentParts().writes.applyWritesTool.needsApproval` |
| `attack.report.keys` | sorted keys of the report against the inert executor |
| `attack.case.keys` | sorted keys of the first case of that report |
| `attack.names` | the `name` of every case of that report, in the report's order |
| `attack.missingExecute` | `attackSandbox(args)`, the thrown error |
| `app.toolNames` | `agentParts().toolNames`, sorted |
| `app.stepLimit` | `agentParts().stepLimit` |
| `app.stateAfterStaleFlow` | `runScriptedCase` with the script code, `apply_writes`, text, and approval `approve`; then `{ last_program_is_script_program, last_ledger_facade_calls, runs }` from `agent_state` |
| `harness.noCases` | computed in Node by `verify/runner/harness.ts`: the verifier on a temporary repository with the real criteria and no cases |
| `harness.fenceByte` | computed in Node: the verifier on a temporary repository with one signed case and one byte added to it |
| `harness.recordLine` | `sh loop/record.sh <pass> <exit-code>` with `MITTENS_ROOT` set to a temp folder; returns `{ lines_appended, keys }`. The builder cannot change this case: `loop/` is fenced. |

## 5. Adversarial cases with a suite

`input.options.suite` `"attackSandbox"` with `input.options.executor` `"sandbox"` or `"leaky-env"` runs the whole suite against that executor. The adapter returns `{ error: null, result: { breached: report.breached, breachedNames: <names of the cases whose outcome is "breached"> } }`.
