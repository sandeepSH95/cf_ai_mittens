/**
 * The adapter: the one place where a gold case meets the code under test.
 *
 *   gold case (kind, input) --> runCase() --> packages by name --> actual value (JSON)
 *
 *   adversarial  createSandbox({ loader, gate, ...input.options }).execute(program)
 *                  --> { error, result }
 *                with options.suite "attackSandbox": the attack suite against
 *                options.executor ("sandbox" or "leaky-env")
 *                  --> { error: null, result: { breached, breachedNames } }
 *   contract     registry.ts: input.call --> one small function --> its JSON value
 *   exact        mittens_demo/testing runScriptedCase(input) --> its report;
 *                cases.test.ts compares only the keys the case expects
 *
 * The adapter knows no expected value and never reads a case id to decide
 * what to do. It maps kind and input to calls, nothing more. What the
 * packages must provide is written in verify/runner/CONTRACT.md.
 *
 * A failure of the code under test is a ContractError: one line that starts
 * with "contract: ". No case may crash the runner.
 *
 * This file is inside the fence: the builder never edits it.
 */

import type { Json, JsonObject } from "../normalise.ts";
import { escapedExecutor, leakyBase64Executor, leakyExecutor, sandboxExecutor } from "./executors.ts";
import type { Execute } from "./executors.ts";
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
import { runCall } from "./registry.ts";
import type { HarnessFacts } from "./registry.ts";

/** A gold case as the runner hands it over. Shape checked by lint-case.ts. */
export interface RunnableCase {
  readonly id: string;
  readonly kind: string;
  readonly covers: string[];
  readonly input: JsonObject;
  readonly expected: Json;
}

/** Path relative to the repository root -> file text. Example: "fixtures/repo-small.json". */
export type CaseFiles = Record<string, string>;

type KindRunner = (goldCase: RunnableCase, files: CaseFiles, harness: HarnessFacts) => Promise<Json>;

const AGENT_NAME_PREFIX = "verify-";

const SUITE_KEY = "suite";
const EXECUTOR_KEY = "executor";
const ATTACK_SUITE = "attackSandbox";
const BREACHED = "breached";

// The limits the suite's runaway programs need to end fast on the real sandbox.
const SUITE_TICK_BUDGET = 10_000;
const SUITE_TIMEOUT_MS = 500;

const REPORT_SHAPE = "attackSandbox must resolve to { cases, breached }";
const CASES_SHAPE = "the attack report must hold a list 'cases' of { name, outcome, detail }";
const SCRIPT_REPORT_SHAPE = "runScriptedCase(input) must resolve to a report object";

/** Executor name in input.options.executor -> how to build it. */
const SUITE_EXECUTORS: Readonly<Record<string, (canary: string) => Promise<Execute>>> = {
  sandbox: () => sandboxExecutor({ tickBudget: SUITE_TICK_BUDGET, timeoutMs: SUITE_TIMEOUT_MS }),
  "leaky-env": async (canary) => leakyExecutor(canary),
  "leaky-base64": async (canary) => leakyBase64Executor(canary),
  escaped: async () => escapedExecutor(),
};

const KIND_RUNNERS: Readonly<Record<string, KindRunner>> = {
  adversarial: runAdversarial,
  contract: runContract,
  exact: runExact,
};

/** Runs one case against the real packages and returns the actual value. */
export async function runCase(
  goldCase: RunnableCase,
  files: CaseFiles,
  harness: HarnessFacts = {},
): Promise<Json> {
  const runner = KIND_RUNNERS[goldCase.kind];

  try {
    if (runner === undefined) {
      return fail(`the adapter does not run cases of kind '${goldCase.kind}'`);
    }

    return await runner(goldCase, files, harness);
  } catch (failure) {
    if (failure instanceof ContractError) {
      throw failure;
    }

    // Nothing the packages do may look like a crash of the runner.
    return fail(`${goldCase.kind} case threw ${nameOf(failure)}: ${messageOf(failure)}`);
  }
}

async function runAdversarial(goldCase: RunnableCase, files: CaseFiles): Promise<Json> {
  const { [SUITE_KEY]: suite, [EXECUTOR_KEY]: executor, ...sandboxOptions } = optionsOf(goldCase);

  if (suite !== undefined) {
    return runSuite(suite, executor);
  }

  const program = fileText(files, goldCase.input.program);
  const execute = await sandboxExecutor(sandboxOptions);
  const outcome = await execute(program);

  return { error: toJson(outcome.error, "error"), result: toJson(outcome.result, "result") };
}

/** ATK-003: the whole suite against one executor, as { breached, breachedNames }. */
async function runSuite(suite: Json, executorName: Json | undefined): Promise<Json> {
  const makeExecutor = SUITE_EXECUTORS[String(executorName)];

  if (suite !== ATTACK_SUITE || makeExecutor === undefined) {
    return fail(`the adapter has no suite '${String(suite)}' with executor '${String(executorName)}'`);
  }

  const attackSandbox = await loadExport(Exports.attackSandbox);
  const canary = canaryToken();
  const execute = await makeExecutor(canary);
  const called = await guarded("attackSandbox({ execute, canary })", () => attackSandbox({ execute, canary }));
  const report = expectObject(called, REPORT_SHAPE);

  if (!Array.isArray(report.cases)) {
    return fail(CASES_SHAPE);
  }

  const breachedNames = report.cases
    .map((attack) => expectObject(attack, CASES_SHAPE))
    .filter((attack) => attack.outcome === BREACHED)
    .map((attack) => toJson(attack.name, "name"));

  return { error: null, result: { breached: toJson(report.breached, BREACHED), breachedNames } };
}

async function runContract(goldCase: RunnableCase, files: CaseFiles, harness: HarnessFacts): Promise<Json> {
  const input = goldCase.input;
  const args = isObject(input.args) ? input.args : {};

  return runCall(args, { call: String(input.call), agentName: agentName(goldCase), files, harness });
}

async function runExact(goldCase: RunnableCase, files: CaseFiles): Promise<Json> {
  const input = goldCase.input;
  const script = Array.isArray(input.model_script) ? input.model_script : [];
  const runScriptedCase = await loadExport(Exports.runScriptedCase);
  const scripted = {
    agentName: agentName(goldCase),
    fixture: fileText(files, input.fixtures),
    now: input.now ?? null,
    userMessage: input.user_message ?? null,
    script: script.map((step) => resolveStep(step, files)),
    approval: input.approval ?? null,
  };
  const report = await guarded("runScriptedCase(input)", () => runScriptedCase(scripted));

  return toJson(expectObject(report, SCRIPT_REPORT_SHAPE), "the report");
}

/** Puts the program text in place of its path. A text step is passed as it is. */
function resolveStep(step: Json, files: CaseFiles): Json {
  if (!isObject(step) || typeof step.program !== "string") {
    return step;
  }

  return { ...step, program: fileText(files, step.program) };
}

/** One agent instance per case, so no case reads the state of another. */
function agentName(goldCase: RunnableCase): string {
  return `${AGENT_NAME_PREFIX}${goldCase.id}`;
}

function optionsOf(goldCase: RunnableCase): JsonObject {
  const options = goldCase.input.options;

  return isObject(options) ? options : {};
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
