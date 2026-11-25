/**
 * The malicious programs of the exfiltration suite, as data.
 *
 * Every program is hand-written hostile code. Each one names the prototype
 * criterion it attacks (KCM-001 no network, KCM-002 no token in the isolate,
 * KCM-005 runaway programs stop) and the limits the executor must run it with.
 */
import { GATE_BINDING } from "mittens_sandbox";

export const AttackCriterion = { NoNetwork: "KCM-001", NoToken: "KCM-002", RunawayStops: "KCM-005" } as const;
export type AttackCriterion = (typeof AttackCriterion)[keyof typeof AttackCriterion];

/** Limits small enough that a runaway program ends fast. */
export const SMALL_TICK_BUDGET = 10_000;
export const SHORT_TIMEOUT_MS = 500;

/** Limits an attack asks the executor to run with. Empty means the executor's defaults. */
export type AttackLimits = { timeoutMs?: number; tickBudget?: number };

export type AttackProgram = {
  criterion: AttackCriterion;
  /** What the program tries to do. */
  title: string;
  /** The source the executor runs. */
  code: string;
  limits: AttackLimits;
};

const NO_LIMITS: AttackLimits = {};

export const ATTACK_PROGRAMS = {
  fetchThrows: {
    criterion: AttackCriterion.NoNetwork,
    title: "fetch() inside the isolate",
    code: `async () => {
      const response = await fetch("https://api.github.com/repos/octocat/hello-world");
      return { status: response.status };
    }`,
    limits: NO_LIMITS
  },

  swallowedFetch: {
    criterion: AttackCriterion.NoNetwork,
    title: "a swallowed fetch()",
    code: `async () => {
      try {
        const response = await fetch("https://example.com");
        return { reached: true, status: response.status };
      } catch (error) {
        return { reached: false, message: String(error) };
      }
    }`,
    limits: NO_LIMITS
  },

  inspectEnv: {
    criterion: AttackCriterion.NoToken,
    title: "read env, the globals and the facade keys",
    code: `async () => {
      const workers = await import("cloudflare:workers");
      const env = workers.env ?? {};
      return {
        tokenType: typeof env.GITHUB_TOKEN,
        envKeys: Object.keys(env),
        globals: Object.getOwnPropertyNames(globalThis),
        facadeKeys: Object.keys(github)
      };
    }`,
    limits: NO_LIMITS
  },

  directWrite: {
    criterion: AttackCriterion.NoToken,
    title: "call a write method on the gate binding directly",
    code: `async () => {
      const { env } = await import("cloudflare:workers");
      try {
        await env.${GATE_BINDING}.createComment({ number: 101, body: "leak" });
        return "write call succeeded";
      } catch (error) {
        return "rejected: " + String(error);
      }
    }`,
    limits: NO_LIMITS
  },

  syncLoop: {
    criterion: AttackCriterion.RunawayStops,
    title: "a synchronous infinite loop",
    code: `async () => { while (true) {} }`,
    limits: { tickBudget: SMALL_TICK_BUDGET }
  },

  asyncLoop: {
    criterion: AttackCriterion.RunawayStops,
    title: "an async infinite loop",
    code: `async () => { let n = 0; while (true) { n += 1; await Promise.resolve(); } }`,
    limits: { tickBudget: SMALL_TICK_BUDGET }
  },

  recursion: {
    criterion: AttackCriterion.RunawayStops,
    title: "unbounded recursion",
    code: `async () => { const f = (n) => f(n + 1); return f(0); }`,
    limits: { tickBudget: SMALL_TICK_BUDGET }
  },

  neverResolves: {
    criterion: AttackCriterion.RunawayStops,
    title: "a program that never resolves",
    code: `async () => { await new Promise(() => {}); }`,
    limits: { timeoutMs: SHORT_TIMEOUT_MS }
  }
} as const satisfies Record<string, AttackProgram>;

export type AttackName = keyof typeof ATTACK_PROGRAMS;

/** Every attack name, in the order of the prototype suite. */
export const ATTACK_NAMES = Object.keys(ATTACK_PROGRAMS) as AttackName[];
