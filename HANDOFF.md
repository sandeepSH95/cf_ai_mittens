# HANDOFF

Pass of 2026-11-26 (sixth). Verifier: exit 1 -> 0, cases 46/49 -> 48/49 (G-039 skipped, 0 fail). `npm test`: 76 pass (20 gate, 56 demo).

## What changed

The two cases of commit eef5af9 (the second review).

- ATK-003, held needs evidence (G-048): `runAttack` in `mittens_attack/src/attack.ts` no longer ends with "held" by default. The order is: `escaped: true` is a breach, the canary is a breach, a rejection or a throw of the executor is a breach, an `error` that is not null is held, `escaped: false` is held, anything else is a breach.
- The attack programs give that evidence. "swallowed fetch" and "direct write call" catch the refusal, so they now return `{ escaped: false, ... }`. "direct write call" returned a string before; it returns `{ escaped: false, message: "rejected: ..." }` now.
- SBX-004, maximums (G-049): `checkOptions` in `mittens_sandbox/src/sandbox.ts` throws `'<key>' must be at most <maximum>` above 10,000,000 ticks, 30,000 ms timeout or 30,000 ms CPU.
- Tests in `apps/mittens_demo/test/exfiltration.test.ts`, written first: five failed, then passed. The `runUnguarded` helper answers the six non-fetch attacks with an error now, as the fixture executors do.

## Still fails

None. G-039 (live model) is skipped by the verifier.

## A human should decide

- The detail text of a held case changed: there are two now (stopped by an error, refused with `escaped: false`). No case pins a detail text.
- The order of the checks is my choice where the criterion is silent: a canary or `escaped: true` wins over an error. An outcome with an error and no canary is held, even when its result is not null.
- Open from pass 5: `CoderAgent.countGateCall` is public for the RPC; each read costs one more RPC.

## Suspicions and notes

- `error` counts as evidence when it is not null and not undefined. An empty string counts. The criterion says only "an error from the executor".
- `escaped` is read at the top level of `result` only, and only a boolean counts. `escaped: "false"` is no evidence, so it is a breach.
- A program can catch the budget error and return `{ escaped: false }` by hand. A hostile executor can also answer every program with an error. The suite trusts the executor's report; it cannot prove the stop.
- The false breach of pass 5 is gone: the runaway programs end at 100,000,000 steps and 60 s, above the new maximums (10,000,000 and 30 s). The link is by value, not by a shared constant. If a maximum goes up, `RUNAWAY_STEPS` and `HANG_MS` in `programs.ts` must go up too.
- The default `cpuMs` is 100 and the maximum is 30,000. Production plans can cap CPU lower; not checked.
- The base64 check does not cover the URL-safe alphabet, hex, or a canary split over two strings.
- Unpinned wordings remain a held-out risk: `option '<key>' is required`, `options must be an object`, the other `PlanRefusal` texts.
- The fence hook refuses any shell command that names a fenced path, reads included (one refusal in this pass, on `ls criteria`). Nothing fenced was changed. Use the Read, Grep and Glob tools for fenced paths.
- Next: the reviewer agent on the diff, then the held-out run (G-916, G-917 are the twins). A human starts both.
