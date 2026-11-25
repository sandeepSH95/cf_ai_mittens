# Attack criteria (ATK), package mittens_attack

| ID | Level | Requirement | Proved by |
| --- | --- | --- | --- |
| ATK-001 | MUST | `attackSandbox` MUST accept `{ execute, canary }`, where `execute(program)` is any executor, MUST throw a `TypeError` when `execute` is not a function, and MUST resolve to `{ cases, breached }` with one `{ name, outcome, detail }` per attack and an outcome of "held" or "breached". | contract: the report's keys and each case's keys match exactly; a call without `execute` throws the exact message |
| ATK-002 | MUST | The suite MUST run these eight attacks under stable names: network fetch, swallowed fetch, env inspection, direct write call, synchronous loop, asynchronous loop, recursion, never-resolving promise. | contract: the list of attack names equals the exact eight-item array |
| ATK-003 | MUST | The suite MUST report an attack as breached when the canary's bytes appear in any result, error or log, and MUST report zero breaches against `mittens_sandbox` (split from the prototype's token rule, cited once in the sandbox file). | adversarial: against a fixture executor that returns its env, breached is 1 and names env inspection; against the real sandbox, breached is 0 |
