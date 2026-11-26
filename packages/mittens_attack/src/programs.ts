/**
 * The malicious programs of the attack suite, as data.
 *
 * Every program is hand-written hostile code. Each one names the criterion
 * it attacks: SBX-001 no network, SBX-002 no token in the isolate, GATE-001
 * no write through the handle, SBX-003 runaway programs stop.
 *
 * Only the env inspection program may list the keys of env. A fixture
 * executor uses that text to tell the attacks apart.
 */
import { GATE_BINDING } from "mittens_sandbox";

export const AttackCriterion = { NoNetwork: "SBX-001", NoToken: "SBX-002", NoDirectWrite: "GATE-001", RunawayStops: "SBX-003" } as const;
export type AttackCriterion = (typeof AttackCriterion)[keyof typeof AttackCriterion];

export type AttackProgram = {
  /** The stable name in the report. */
  name: string;
  criterion: AttackCriterion;
  /** The source the executor runs. */
  code: string;
};

/** Every attack, in the order of the report. */
export const ATTACK_PROGRAMS: readonly AttackProgram[] = [
  {
    name: "network fetch",
    criterion: AttackCriterion.NoNetwork,
    code: `async () => {
      const response = await fetch("https://api.github.com/repos/octocat/hello-world");
      return { status: response.status };
    }`
  },

  {
    name: "swallowed fetch",
    criterion: AttackCriterion.NoNetwork,
    code: `async () => {
      try {
        const response = await fetch("https://example.com");
        return { reached: true, status: response.status };
      } catch (error) {
        return { reached: false, message: String(error) };
      }
    }`
  },

  {
    name: "env inspection",
    criterion: AttackCriterion.NoToken,
    code: `async () => {
      const workers = await import("cloudflare:workers");
      const env = workers.env ?? {};
      return {
        tokenType: typeof env.GITHUB_TOKEN,
        envKeys: Object.keys(env),
        env: { ...env, ${GATE_BINDING}: undefined },
        globals: Object.getOwnPropertyNames(globalThis)
      };
    }`
  },

  {
    name: "direct write call",
    criterion: AttackCriterion.NoDirectWrite,
    code: `async () => {
      const { env } = await import("cloudflare:workers");
      try {
        await env.${GATE_BINDING}.createComment({ number: 101, body: "leak" });
        return "write call succeeded";
      } catch (error) {
        return "rejected: " + String(error);
      }
    }`
  },

  {
    name: "synchronous loop",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => { while (true) {} }`
  },

  {
    name: "asynchronous loop",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => { let n = 0; while (true) { n += 1; await Promise.resolve(); } }`
  },

  {
    name: "recursion",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => { const f = (n) => f(n + 1); return f(0); }`
  },

  {
    name: "never-resolving promise",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => { await new Promise(() => {}); }`
  }
];
