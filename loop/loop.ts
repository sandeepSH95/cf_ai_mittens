/**
 * The build loop. One run is a list of builder passes with the verifier between them.
 *
 *            +--------------------------------------------------------------+
 *            v                                                              |
 *   verify --+-- exit 0 ----------> stop, green                (exit 0)     |
 *            +-- exit 3, 4 or 5 --> stop, a human must look    (same exit)  |
 *            +-- exit 1 --> cap reached? --yes--> stop         (exit 1)     |
 *                               | no                                        |
 *                               v                                           |
 *                  save ledger/pass-start.json                              |
 *                  claude -p loop/PROMPT.md   (a fresh session per pass)    |
 *                  verify, then record one ledger line  --------------------+
 *
 * The builder never decides that the work is done. The exit code of the
 * verifier does. The caps are in loop/caps.env.
 *
 * Usage: sh loop/loop.sh
 */

import { spawnSync } from "node:child_process";
import { closeSync, copyFileSync, existsSync, openSync, readFileSync } from "node:fs";
import path from "node:path";

import { ExitCode } from "../verify/exit-codes.ts";
import { LAST_RUN_PATH, LEDGER_PATH, loopRoot, readLastRun, recordPass } from "./record.ts";

const CAPS_PATH = "loop/caps.env";
const PROMPT_PATH = "loop/PROMPT.md";
const VERIFIER_PATH = "verify/run.sh";

// The Stop hook compares the end of a pass with this copy of last-run.json.
export const PASS_START_PATH = "ledger/pass-start.json";

// The hooks in .claude/ read this variable. It marks a builder pass.
export const LOOP_VARIABLE = "MITTENS_LOOP";
const LOOP_ON = "1";

const BUILDER_COMMAND = "claude";

// The builder may edit and run commands without a person. The hooks in
// .claude/ and the manifest are what keeps it out of the fenced files.
const BUILDER_FLAGS: readonly string[] = [
  "--permission-mode",
  "acceptEdits",
  "--allowedTools",
  "Bash,Read,Edit,Write,Glob,Grep",
  "--output-format",
  "json",
];

const MS_PER_MINUTE = 60_000;
const CAP_LINE = /^([A-Z_]+)=([0-9]+)$/;

/** The four numbers of loop/caps.env. */
export interface Caps {
  readonly MAX_PASSES: number;
  readonly PLATEAU: number;
  readonly MAX_MINUTES: number;
  readonly PASS_MINUTES: number;
}

const CAP_NAMES: readonly (keyof Caps)[] = ["MAX_PASSES", "PLATEAU", "MAX_MINUTES", "PASS_MINUTES"];

export const Stop = {
  NONE: "",
  PASSES: "cap reached: passes",
  PLATEAU: "cap reached: plateau",
  MINUTES: "cap reached: minutes",
} as const;

export type Stop = (typeof Stop)[keyof typeof Stop];

/** Where a run is after a pass. */
export interface Progress {
  readonly passesDone: number;

  // Passes in a row that did not lower the failing count.
  readonly stalled: number;
  readonly minutesUsed: number;
}

/** Parses KEY=NUMBER lines. Example: "MAX_PASSES=12" -> { MAX_PASSES: 12 }. */
export function parseCaps(text: string): Caps {
  const found: Record<string, number> = {};

  for (const line of text.split(/\r?\n/)) {
    const match = CAP_LINE.exec(line.trim());

    if (!match) {
      continue;
    }

    found[String(match[1])] = Number(match[2]);
  }

  for (const name of CAP_NAMES) {
    if (!(name in found)) {
      throw new Error(`${CAPS_PATH}: ${name} is missing`);
    }
  }

  return found as unknown as Caps;
}

/** Names the cap that stops the run, or Stop.NONE when the next pass may start. */
export function capReached(caps: Caps, progress: Progress): Stop {
  if (progress.minutesUsed >= caps.MAX_MINUTES) {
    return Stop.MINUTES;
  }

  if (progress.passesDone >= caps.MAX_PASSES) {
    return Stop.PASSES;
  }

  if (progress.stalled >= caps.PLATEAU) {
    return Stop.PLATEAU;
  }

  return Stop.NONE;
}

/** The pass number after the last ledger line. Example: last line pass 3 -> 4. */
export function nextPass(ledgerText: string): number {
  const lines = ledgerText.split("\n").filter((line) => line.trim() !== "");
  const last = lines.at(-1);

  if (last === undefined) {
    return 1;
  }

  return Number((JSON.parse(last) as { pass: number }).pass) + 1;
}

function runVerifier(root: string): number {
  const run = spawnSync("sh", [path.join(root, VERIFIER_PATH)], { cwd: root, stdio: "inherit" });

  return run.status ?? ExitCode.VERIFIER_ERROR;
}

/** One fresh headless session. Its JSON result goes to ledger/pass-N.json. */
function runBuilder(root: string, pass: number, timeoutMinutes: number): void {
  const prompt = readFileSync(path.join(root, PROMPT_PATH), "utf8");
  const output = openSync(path.join(root, `ledger/pass-${pass}.json`), "w");

  try {
    spawnSync(BUILDER_COMMAND, ["-p", prompt, ...BUILDER_FLAGS], {
      cwd: root,
      env: { ...process.env, [LOOP_VARIABLE]: LOOP_ON },
      stdio: ["ignore", output, "inherit"],
      timeout: timeoutMinutes * MS_PER_MINUTE,
    });
  } finally {
    closeSync(output);
  }
}

function failedCount(root: string): number {
  return readLastRun(root).failed ?? Number.POSITIVE_INFINITY;
}

function readLedger(root: string): string {
  const ledgerFile = path.join(root, LEDGER_PATH);

  return existsSync(ledgerFile) ? readFileSync(ledgerFile, "utf8") : "";
}

function main(): number {
  const root = loopRoot();
  const caps = parseCaps(readFileSync(path.join(root, CAPS_PATH), "utf8"));
  const startedAt = Date.now();

  let exitCode = runVerifier(root);
  let best = failedCount(root);
  let pass = nextPass(readLedger(root));
  let passesDone = 0;
  let stalled = 0;

  while (exitCode === ExitCode.RED) {
    const minutesUsed = (Date.now() - startedAt) / MS_PER_MINUTE;
    const stop = capReached(caps, { passesDone, stalled, minutesUsed });

    if (stop !== Stop.NONE) {
      console.log(stop);
      return ExitCode.RED;
    }

    console.log(`pass ${pass} starts, ${best} failing`);
    copyFileSync(path.join(root, LAST_RUN_PATH), path.join(root, PASS_START_PATH));
    runBuilder(root, pass, Math.min(caps.PASS_MINUTES, caps.MAX_MINUTES - minutesUsed));

    exitCode = runVerifier(root);
    console.log(JSON.stringify(recordPass(root, pass, exitCode)));

    const failed = failedCount(root);
    stalled = failed < best ? 0 : stalled + 1;
    best = Math.min(best, failed);
    passesDone += 1;
    pass += 1;
  }

  console.log(exitCode === ExitCode.GREEN ? "green" : `stopped: the verifier exited ${exitCode}, a human must look`);
  return exitCode;
}

if (import.meta.main) {
  process.exitCode = main();
}
