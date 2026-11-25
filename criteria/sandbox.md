# Sandbox criteria (SBX), package mittens_sandbox

| ID | Level | Requirement | Proved by |
| --- | --- | --- | --- |
| SBX-001 | MUST | The sandbox MUST load every program with outbound network disabled and MUST NOT offer any option that enables it (was KCM-001). | adversarial: a program awaits `fetch("https://example.com")`; expected error "This worker is not permitted to access the internet", result null; a second program catches the error and returns its message |
| SBX-002 | MUST | The isolate's environment MUST contain exactly one binding, the gate handle, and MUST NOT contain the token (was KCM-002). | adversarial: a program lists env keys and the token type; expected keys ["GH"], type "undefined" |
| SBX-003 | MUST | The sandbox MUST stop a runaway program (synchronous loop, asynchronous loop, unbounded recursion, never-resolving promise) by the tick budget or the outer timeout and MUST return it as an error instead of hanging (was KCM-005). | adversarial: four programs, one per shape, with `tickBudget` 10000; each expects its exact error string and result null |
| SBX-004 | MUST | `createSandbox` MUST accept exactly `loader`, `gate`, `tickBudget`, `timeoutMs` and `cpuMs`, MUST throw a `TypeError` on any other key or on a non-positive number, and MUST return an object whose only method is `execute(program)`. | contract: the returned object's keys equal ["execute"]; a call with `globalOutbound` set throws the exact message |
| SBX-005 | MUST | `execute(program)` MUST always resolve, never reject, to `{ result, error, facadeCalls, isolateStartMs }`, where `isolateStartMs` is null when the program made no gate call. | exact: a program making 7 gate reads resolves with facadeCalls 7 and error null; a program making none resolves with isolateStartMs null |
