/**
 * The malicious programs of the attack suite, as data.
 *
 * Every program is hand-written hostile code. Each one names the criterion
 * it attacks: SBX-001 no network, SBX-002 no token in the isolate, GATE-001
 * no write through the handle, SBX-003 runaway programs stop.
 *
 * Only the env inspection program may list the keys of env. A fixture
 * executor uses that text to tell the attacks apart.
 *
 * Each program returns { escaped: true } when its forbidden action succeeded.
 * A runaway program cannot report that it never ended. So each one ends by
 * itself, far above the default limits of mittens_sandbox, and reports then:
 *
 *   executor stops it           -> an error, no result       held
 *   executor lets it run out    -> { escaped: true }         breached
 */
import { DEFAULT_TICK_BUDGET, DEFAULT_TIMEOUT_MS, GATE_BINDING } from "mittens_sandbox";

/** What a program returns when its forbidden action succeeded. */
export const ESCAPED_KEY = "escaped";

/** Loop turns or calls a runaway program makes before it ends by itself. Example: 100,000,000. */
const RUNAWAY_STEPS = DEFAULT_TICK_BUDGET * 50;
/** Calls per dive. It stays under the native stack limit, so only a call budget stops the recursion. */
const DIVE_DEPTH = 1_000;
/** How long the hanging program waits before it ends by itself. Example: 60,000 ms. */
const HANG_MS = DEFAULT_TIMEOUT_MS * 6;

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
      return { ${ESCAPED_KEY}: true, status: response.status };
    }`
  },

  {
    name: "swallowed fetch",
    criterion: AttackCriterion.NoNetwork,
    code: `async () => {
      try {
        const response = await fetch("https://example.com");
        return { ${ESCAPED_KEY}: true, reached: true, status: response.status };
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
      const envKeys = Object.keys(env);
      return {
        ${ESCAPED_KEY}: envKeys.some((key) => key !== "${GATE_BINDING}"),
        tokenType: typeof env.GITHUB_TOKEN,
        envKeys,
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
        return { ${ESCAPED_KEY}: true };
      } catch (error) {
        return "rejected: " + String(error);
      }
    }`
  },

  {
    name: "synchronous loop",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => {
      let n = 0;
      while (n < ${RUNAWAY_STEPS}) { n += 1; }
      return { ${ESCAPED_KEY}: true };
    }`
  },

  {
    name: "asynchronous loop",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => {
      let n = 0;
      while (n < ${RUNAWAY_STEPS}) { n += 1; await Promise.resolve(); }
      return { ${ESCAPED_KEY}: true };
    }`
  },

  {
    name: "recursion",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => {
      const dive = (depth) => (depth === 0 ? 1 : 1 + dive(depth - 1));
      let calls = 0;
      while (calls < ${RUNAWAY_STEPS}) { calls += dive(${DIVE_DEPTH}); }
      return { ${ESCAPED_KEY}: true };
    }`
  },

  {
    name: "never-resolving promise",
    criterion: AttackCriterion.RunawayStops,
    code: `async () => {
      await new Promise((resolve) => setTimeout(resolve, ${HANG_MS}));
      return { ${ESCAPED_KEY}: true };
    }`
  }
];
