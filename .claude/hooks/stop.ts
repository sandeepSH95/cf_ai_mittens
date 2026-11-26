/**
 * Stop hook of a builder pass. It runs the verifier before the pass may end.
 *
 *   verifier exit 0 or 4 ----------------------------> the pass may end
 *   verifier exit 3 or 5 ----------------------------> exit 2: undo the change, then stop
 *   verifier exit 1 --> a case that passed when the
 *                       pass started fails now? --yes-> exit 2: fix the regression
 *                                               --no--> the pass may end
 *
 * A pass may end red: the loop starts the next one. A pass may not end worse
 * than it started. Outside the loop (no MITTENS_LOOP=1) the hook does nothing.
 */

import { spawnSync } from "node:child_process";
import path from "node:path";

import { ExitCode } from "../../verify/exit-codes.ts";
import { LOOP_VARIABLE, PASS_START_PATH } from "../../loop/loop.ts";
import { readLastRun } from "../../loop/record.ts";

const LOOP_ON = "1";
const PROJECT_VARIABLE = "CLAUDE_PROJECT_DIR";
const VERIFIER_PATH = "verify/run.sh";
const OUTPUT_TAIL_LINES = 40;
const EXIT_ALLOW = 0;
const EXIT_BLOCK = 2;

/** The ids that fail now and did not fail at the start of the pass. */
export function regressions(failingAtStart: string[], failingNow: string[]): string[] {
  return failingNow.filter((id) => !failingAtStart.includes(id));
}

function tail(text: string): string {
  return text.trimEnd().split("\n").slice(-OUTPUT_TAIL_LINES).join("\n");
}

function main(): number {
  if (process.env[LOOP_VARIABLE] !== LOOP_ON) {
    return EXIT_ALLOW;
  }

  const root = process.env[PROJECT_VARIABLE] ?? path.resolve(import.meta.dirname, "../..");
  const run = spawnSync("sh", [path.join(root, VERIFIER_PATH)], { cwd: root, encoding: "utf8" });
  const exitCode = run.status ?? ExitCode.VERIFIER_ERROR;

  if (exitCode === ExitCode.GREEN || exitCode === ExitCode.UNCOVERED) {
    return EXIT_ALLOW;
  }

  if (exitCode !== ExitCode.RED) {
    console.error(`the verifier exited ${exitCode}. Undo the change that caused it, then stop.\n${tail(run.stdout ?? "")}`);
    return EXIT_BLOCK;
  }

  const atStart = readLastRun(root, PASS_START_PATH);
  const broken = regressions(atStart.failing, readLastRun(root).failing);

  if (broken.length === 0) {
    return EXIT_ALLOW;
  }

  console.error(`these cases passed when the pass started and fail now: ${broken.join(", ")}\n${tail(run.stdout ?? "")}`);
  return EXIT_BLOCK;
}

if (import.meta.main) {
  process.exitCode = main();
}
