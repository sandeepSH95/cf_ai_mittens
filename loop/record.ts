/**
 * Appends one line per loop pass to the ledger.
 *
 *   ledger/last-run.json (the verifier wrote it)      git HEAD
 *              |                                          |
 *              v                                          v
 *   { pass, commit, exit_code, passed, failed, failing }  -->  ledger/iterations.jsonl
 *
 * Usage: node loop/record.ts <pass> <exit-code>
 * MITTENS_ROOT names another repository root. The verifier's own cases use it,
 * so a test never writes to the real ledger.
 */

import { spawnSync } from "node:child_process";
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

export const LEDGER_PATH = "ledger/iterations.jsonl";
export const LAST_RUN_PATH = "ledger/last-run.json";

const REPO_ROOT = path.resolve(import.meta.dirname, "..");
const ROOT_VARIABLE = "MITTENS_ROOT";
const NO_COMMIT = "none";
const USAGE = "usage: sh loop/record.sh <pass> <exit-code>";
const EXIT_OK = 0;
const EXIT_USAGE = 2;

/** One ledger line. The key list is HARN-003. */
export interface LedgerLine {
  readonly pass: number;
  readonly commit: string;
  readonly exit_code: number;

  // Null when the verifier wrote no counts, for example after a crash.
  readonly passed: number | null;
  readonly failed: number | null;
  readonly failing: string[];
}

/** The parts of ledger/last-run.json the loop reads. */
export interface LastRun {
  readonly passed: number | null;
  readonly failed: number | null;
  readonly failing: string[];
}

const EMPTY_RUN: LastRun = { passed: null, failed: null, failing: [] };

/** The repository the loop works on. */
export function loopRoot(): string {
  return path.resolve(process.env[ROOT_VARIABLE] ?? REPO_ROOT);
}

/**
 * Reads a result file of the verifier. A missing or broken file gives no counts.
 * runPath names another copy, for example ledger/pass-start.json.
 */
export function readLastRun(root: string, runPath: string = LAST_RUN_PATH): LastRun {
  try {
    const lastRun = JSON.parse(readFileSync(path.join(root, runPath), "utf8")) as Record<string, unknown>;

    return {
      passed: countOf(lastRun.passed),
      failed: countOf(lastRun.failed),
      failing: Array.isArray(lastRun.failing) ? lastRun.failing.map(String) : [],
    };
  } catch {
    return EMPTY_RUN;
  }
}

/** Appends the line of one pass and returns it. */
export function recordPass(root: string, pass: number, exitCode: number): LedgerLine {
  const lastRun = readLastRun(root);
  const line: LedgerLine = {
    pass,
    commit: headCommit(root),
    exit_code: exitCode,
    passed: lastRun.passed,
    failed: lastRun.failed,
    failing: lastRun.failing,
  };

  const ledgerFile = path.join(root, LEDGER_PATH);
  mkdirSync(path.dirname(ledgerFile), { recursive: true });
  appendFileSync(ledgerFile, `${JSON.stringify(line)}\n`);

  return line;
}

function countOf(value: unknown): number | null {
  return typeof value === "number" ? value : null;
}

/** Example: "8608f52". "none" when the root is not a git repository. */
function headCommit(root: string): string {
  const git = spawnSync("git", ["rev-parse", "--short", "HEAD"], { cwd: root, encoding: "utf8" });
  const commit = (git.stdout ?? "").trim();

  return git.status === EXIT_OK && commit !== "" ? commit : NO_COMMIT;
}

function main(args: string[]): number {
  const [pass, exitCode] = args.map(Number);

  if (args.length !== 2 || !isCount(pass) || !isCount(exitCode)) {
    console.error(USAGE);
    return EXIT_USAGE;
  }

  console.log(JSON.stringify(recordPass(loopRoot(), pass, exitCode)));
  return EXIT_OK;
}

function isCount(value: number | undefined): value is number {
  return value !== undefined && Number.isInteger(value) && value >= 0;
}

if (import.meta.main) {
  process.exitCode = main(process.argv.slice(2));
}
