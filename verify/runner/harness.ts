/**
 * The three harness.* contract calls. They concern the verifier and the loop
 * scripts themselves, so they cannot run inside workerd. vitest.config.ts
 * computes them here, in Node, and hands the facts to the cases.
 *
 *   harness.noCases     temp repository: the real criteria, no cases, signed
 *                         verify() --> { exit_code, uncovered }
 *   harness.fenceByte   temp repository: one signed case, then one byte added
 *                         verify() --> { exit_code, output_prefix, cases_run }
 *   harness.recordLine  needs loop/record.sh, which step S5 writes. Until a
 *                       human wires it, the fact is an error and the case fails.
 *
 * A fact that cannot be computed is { error }, never a throw: this file runs
 * while the configuration loads, and a throw there would crash the verifier.
 */

import { appendFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import type { GoldCase } from "../lint-case.ts";
import { FENCED_DIRS, MANIFEST_PATH, manifestLines } from "../manifest.ts";
import type { Json } from "../normalise.ts";
import { verify } from "../run.ts";
import type { HarnessFact, HarnessFacts } from "./registry.ts";
import type { CaseRunner } from "./spawn.ts";

const CALL_KEY = "call";
const TEMP_PREFIX = path.join(tmpdir(), "mittens-harness-");
const CRITERIA_DIR = "criteria";
const CASES_DIR = "gold/cases";
const CASE_SUFFIX = ".json";
const RECORD_SCRIPT = "loop/record.sh";
const ONE_BYTE = " ";

// Example: "fence broken: gold/cases/G-001.json (changed)" -> "fence broken: ".
const PREFIX_END = ": ";

/** What one harness call needs to compute its fact. */
interface Scene {
  // The repository the verifier runs for.
  readonly root: string;

  // The folder the cases of this run come from.
  readonly casesDir: string;
}

const COMPUTE: Readonly<Record<string, (scene: Scene) => Json>> = {
  "harness.noCases": noCases,
  "harness.fenceByte": fenceByte,
  "harness.recordLine": recordLine,
};

/** Computes one fact per harness call that the cases of this run name. */
export function harnessFacts(root: string, casesDir: string, cases: GoldCase[]): HarnessFacts {
  const facts: HarnessFacts = {};

  for (const goldCase of cases) {
    const call = goldCase.input[CALL_KEY];

    if (typeof call !== "string" || !(call in COMPUTE) || call in facts) {
      continue;
    }

    facts[call] = computeFact(call, { root, casesDir });
  }

  return facts;
}

function computeFact(call: string, scene: Scene): HarnessFact {
  try {
    return { value: (COMPUTE[call] as (scene: Scene) => Json)(scene) };
  } catch (failure) {
    return { error: failure instanceof Error ? failure.message : String(failure) };
  }
}

/** HARN-001: with no cases the verifier names every MUST and exits 4. */
function noCases(scene: Scene): Json {
  return inTempRepository(scene, (temp) => {
    sign(temp);
    const run = runVerifier(temp);

    return { exit_code: run.exitCode, uncovered: run.uncovered };
  });
}

/** HARN-001, HARN-002: one changed case byte stops the run before any case. */
function fenceByte(scene: Scene): Json {
  return inTempRepository(scene, (temp) => {
    const caseFile = copyOneCase(scene.casesDir, temp);
    sign(temp);
    appendFileSync(caseFile, ONE_BYTE);
    const run = runVerifier(temp);

    return { exit_code: run.exitCode, output_prefix: prefixOf(run.output[0] ?? ""), cases_run: run.casesRun };
  });
}

/** HARN-003. The script does not exist before step S5, and this file does not run it yet. */
function recordLine(scene: Scene): Json {
  if (!existsSync(path.join(scene.root, RECORD_SCRIPT))) {
    throw new Error(`runs in step S5: ${RECORD_SCRIPT} does not exist`);
  }

  throw new Error(`is not wired: a human decides in step S5 how ${RECORD_SCRIPT} runs without the real ledger`);
}

/** Builds a repository with the real criteria and empty fenced folders, then removes it. */
function inTempRepository(scene: Scene, action: (temp: string) => Json): Json {
  const temp = mkdtempSync(TEMP_PREFIX);

  try {
    for (const fencedDir of FENCED_DIRS) {
      mkdirSync(path.join(temp, fencedDir), { recursive: true });
    }

    cpSync(path.join(scene.root, CRITERIA_DIR), path.join(temp, CRITERIA_DIR), { recursive: true });

    return action(temp);
  } finally {
    rmSync(temp, { recursive: true, force: true });
  }
}

/** Does what the human does: writes the manifest of the fenced files. */
function sign(temp: string): void {
  writeFileSync(path.join(temp, MANIFEST_PATH), `${manifestLines(temp).join("\n")}\n`);
}

function copyOneCase(casesDir: string, temp: string): string {
  const name = readdirSync(casesDir).filter((entry) => entry.endsWith(CASE_SUFFIX)).sort()[0];

  if (name === undefined) {
    throw new Error(`found no case to copy in ${casesDir}`);
  }

  const copy = path.join(temp, CASES_DIR, name);
  cpSync(path.join(casesDir, name), copy);

  return copy;
}

interface VerifierRun {
  readonly exitCode: number;
  readonly uncovered: string[];
  readonly output: string[];
  readonly casesRun: number;
}

/** Runs the verifier's checks on the temp repository. Its output is kept, not printed. */
function runVerifier(temp: string): VerifierRun {
  const output: string[] = [];
  let casesRun = 0;

  // Counts the cases that reach the runner. None may, in both scenes.
  const countCases: CaseRunner = (_root, _casesDir, cases) => {
    casesRun += cases.length;
    return [];
  };

  const realLog = console.log;
  console.log = (...parts: unknown[]) => {
    output.push(parts.map(String).join(" "));
  };

  try {
    const outcome = verify(temp, path.join(temp, CASES_DIR), countCases);

    return { exitCode: outcome.exitCode, uncovered: outcome.uncovered, output, casesRun };
  } finally {
    console.log = realLog;
  }
}

function prefixOf(line: string): string {
  const end = line.indexOf(PREFIX_END);

  return end < 0 ? line : line.slice(0, end + PREFIX_END.length);
}
