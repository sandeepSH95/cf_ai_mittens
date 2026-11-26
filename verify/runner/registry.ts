/**
 * The contract calls: one small function per name used in input.call.
 *
 *   { "call": "attack.names", "args": {...} }
 *        |
 *        v
 *   REGISTRY["attack.names"](args, context)  -->  the JSON value the case compares
 *
 * Rules every entry follows:
 *   a key list is returned sorted;
 *   a thrown error is returned as { throws: <error name>, message: <message> },
 *   and { throws: null, message: null } when nothing was thrown;
 *   a harness.* call cannot run inside workerd, so its value is computed in
 *   Node (harness.ts) and handed in with the context.
 */

import type { Json, JsonObject } from "../normalise.ts";
import { buildSandbox, inertExecutor } from "./executors.ts";
import { unknownCall } from "./lines.ts";
import {
  ContractError,
  Exports,
  canaryToken,
  expectObject,
  fail,
  fileText,
  guarded,
  loadExport,
  messageOf,
  nameOf,
  toJson,
} from "./packages.ts";
import type { ExportSpec } from "./packages.ts";

/** The outcome of one harness call, computed in Node before the cases run. */
export type HarnessFact = { readonly value: Json } | { readonly error: string };

/** Call name -> fact. Example: { "harness.noCases": { value: { exit_code: 4, ... } } }. */
export type HarnessFacts = Record<string, HarnessFact>;

export interface CallContext {
  readonly call: string;

  // Names the agent instance of this case, so no two cases share state.
  readonly agentName: string;

  // Path relative to the repository root -> file text.
  readonly files: Record<string, string>;
  readonly harness: HarnessFacts;
}

type ContractCall = (args: JsonObject, context: CallContext) => Promise<Json>;

const AGENT_PARTS_SHAPE = "agentParts() must return { reads, writes, toolNames, stepLimit }";
const READS_SHAPE = "agentParts().reads must be the { facade, spec } that defineReads returned";
const WRITES_SHAPE =
  "agentParts().writes must be the { planSpec, validatePlan, applyWritesTool } that defineWrites returned";

/** A value the agent got from mittens_gate, and the public function that made it. */
interface AgentPart {
  readonly key: string;
  readonly madeBy: ExportSpec;
  readonly shape: string;
}

const READS: AgentPart = { key: "reads", madeBy: Exports.defineReads, shape: READS_SHAPE };
const WRITES: AgentPart = { key: "writes", madeBy: Exports.defineWrites, shape: WRITES_SHAPE };

const TOOL_SHAPE = "applyWritesTool must be an object with needsApproval";
const REPORT_SHAPE = "attackSandbox must resolve to { cases, breached }";
const CASES_SHAPE = "the attack report must hold a non-empty list 'cases' of { name, outcome, detail }";
const STATE_SHAPE = "runScriptedCase(input) must report agent_state { last_program, last_ledger, runs }";

// The three keys of one read (GATE-005). A missing-key case removes one.
const READ_PLACEHOLDER = { input: {}, output: {}, handler: async () => null };

// The stale flow of APP-005: one program, the approved plan, the last answer.
const STALE_FLOW_MESSAGE = "Close my stale pull requests";
const STALE_FLOW_LAST_TEXT = "done";
const LONG_TURN_MESSAGE = "Run the program again";
const CODE_TOOL = "code";
const APPLY_TOOL = "apply_writes";
const APPROVE = "approve";

export const REGISTRY: Readonly<Record<string, ContractCall>> = {
  "sandbox.createSandbox.keys": async () => {
    const sandbox = await guarded("createSandbox(options)", () => buildSandbox({}));

    return sortedKeys(expectObject(sandbox, "createSandbox(options) must return an object"));
  },

  "sandbox.createSandbox.badOption": (args) => thrownBy(() => buildSandbox(args)),

  "gate.defineReads.spec": async () => {
    const reads = await agentPart(READS);
    const spec = reads.spec;

    if (typeof spec !== "function") {
      return fail(READS_SHAPE);
    }

    return toJson(await guarded("spec()", () => spec.call(reads)), "spec()");
  },

  "gate.defineReads.missingInput": async (args) => {
    const defineReads = await loadExport(Exports.defineReads);
    const entry: Record<string, unknown> = { ...READ_PLACEHOLDER };
    delete entry[String(args.missing)];

    return thrownBy(() => defineReads({ [String(args.method)]: entry }));
  },

  "gate.defineWrites.keys": async () => sortedKeys(await agentPart(WRITES)),

  "gate.defineWrites.planSpec": async () => {
    const writes = await agentPart(WRITES);
    const planSpec = writes.planSpec;

    if (typeof planSpec !== "function") {
      return fail(WRITES_SHAPE);
    }

    return toJson(await guarded("planSpec()", () => planSpec.call(writes)), "planSpec()");
  },

  "gate.defineWrites.needsApproval": async () => {
    const writes = await agentPart(WRITES);
    const tool = expectObject(writes.applyWritesTool, TOOL_SHAPE);

    return toJson(tool.needsApproval, "needsApproval");
  },

  "attack.report.keys": async () => sortedKeys(await inertReport()),

  "attack.case.keys": async () => sortedKeys((await inertCases())[0] ?? {}),

  // The order is the suite's own (ATK-002), so this list is not sorted.
  "attack.names": async () => (await inertCases()).map((attack) => toJson(attack.name, "name")),

  "attack.missingExecute": async (args) => {
    const attackSandbox = await loadExport(Exports.attackSandbox);

    return thrownBy(() => attackSandbox(args));
  },

  "app.toolNames": async () => {
    const parts = await agentParts();

    if (!Array.isArray(parts.toolNames)) {
      return fail(AGENT_PARTS_SHAPE);
    }

    return toJson([...parts.toolNames].sort(), "toolNames");
  },

  "app.stepLimit": async () => toJson((await agentParts()).stepLimit, "stepLimit"),

  "app.stateAfterStaleFlow": async (args, context) => {
    const program = fileText(context.files, args.program);
    const runScriptedCase = await loadExport(Exports.runScriptedCase);
    const input = {
      agentName: context.agentName,
      fixture: fileText(context.files, args.fixtures),
      now: args.now ?? null,
      userMessage: STALE_FLOW_MESSAGE,
      script: [{ tool: CODE_TOOL, program }, { tool: APPLY_TOOL }, { text: STALE_FLOW_LAST_TEXT }],
      approval: APPROVE,
    };
    const report = await guarded("runScriptedCase(input)", () => runScriptedCase(input));
    const state = expectObject(expectObject(report, STATE_SHAPE).agent_state, STATE_SHAPE);
    const lastLedger = expectObject(state.last_ledger ?? {}, STATE_SHAPE);

    return {
      // Only the white space at both ends may differ from the file.
      last_program_is_script_program: String(state.last_program).trim() === program.trim(),
      last_ledger_facade_calls: toJson(lastLedger.facade_calls, "facade_calls"),
      runs: toJson(state.runs, "runs"),
    };
  },

  // APP-004 measured: a model that asks for more programs than the limit allows.
  "app.runsInOneTurn": async (args, context) => {
    const program = fileText(context.files, args.program);
    const runScriptedCase = await loadExport(Exports.runScriptedCase);
    const input = {
      agentName: context.agentName,
      fixture: fileText(context.files, args.fixtures),
      now: null,
      userMessage: LONG_TURN_MESSAGE,
      script: Array.from({ length: Number(args.code_steps) }, () => ({ tool: CODE_TOOL, program })),
      approval: null,
    };
    const report = await guarded("runScriptedCase(input)", () => runScriptedCase(input));
    const state = expectObject(expectObject(report, STATE_SHAPE).agent_state, STATE_SHAPE);

    return toJson(state.runs, "runs");
  },

  "harness.noCases": harnessFact,
  "harness.fenceByte": harnessFact,
  "harness.recordLine": harnessFact,
};

/** Runs the registry entry of one contract case. */
export async function runCall(args: JsonObject, context: CallContext): Promise<Json> {
  const entry = REGISTRY[context.call];

  if (entry === undefined) {
    return fail(unknownCall(context.call));
  }

  return entry(args, context);
}

async function harnessFact(_args: JsonObject, context: CallContext): Promise<Json> {
  const fact = context.harness[context.call];

  if (fact === undefined) {
    return fail(`${context.call} has no value from verify/runner/harness.ts`);
  }

  if ("error" in fact) {
    return fail(`${context.call} ${fact.error}`);
  }

  return fact.value;
}

/** Example: { throws: "TypeError", message: "createSandbox: unknown option 'x'" }. */
async function thrownBy(action: () => unknown): Promise<Json> {
  try {
    await action();
  } catch (failure) {
    // A missing export is a failure of the case, not the error under test.
    if (failure instanceof ContractError) {
      throw failure;
    }

    return { throws: nameOf(failure), message: messageOf(failure) };
  }

  return { throws: null, message: null };
}

function sortedKeys(value: Record<string, unknown>): string[] {
  return Object.keys(value).sort();
}

async function agentParts(): Promise<Record<string, unknown>> {
  const read = await loadExport(Exports.agentParts);

  return expectObject(await guarded("agentParts()", () => read()), AGENT_PARTS_SHAPE);
}

/** One of the two gate values the agent uses. GATE-005 and GATE-006 name their keys. */
async function agentPart(part: AgentPart): Promise<Record<string, unknown>> {
  // The value comes from the demo; the function that made it must be public.
  await loadExport(part.madeBy);

  return expectObject((await agentParts())[part.key], part.shape);
}

/** The attack report against an executor that runs nothing. Only its shape is read. */
async function inertReport(): Promise<Record<string, unknown>> {
  const attackSandbox = await loadExport(Exports.attackSandbox);
  const options = { execute: inertExecutor(), canary: canaryToken() };
  const report = await guarded("attackSandbox({ execute, canary })", () => attackSandbox(options));

  return expectObject(report, REPORT_SHAPE);
}

async function inertCases(): Promise<Record<string, unknown>[]> {
  const cases = (await inertReport()).cases;

  if (!Array.isArray(cases) || cases.length === 0) {
    return fail(CASES_SHAPE);
  }

  return cases.map((attack) => expectObject(attack, CASES_SHAPE));
}
