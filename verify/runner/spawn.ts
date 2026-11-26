/**
 * Starts the case runner (vitest inside workerd) and reads its JSON report.
 *
 *   run.ts --> runCasesInWorkerd() --spawn--> vitest --> ledger/runner-report.json
 *                      |                                          |
 *                      +<------------- one CaseResult per case <--+
 *
 * A report that is missing, or that lacks a case, is a crash of the verifier
 * (exit 5), never a failing build.
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import path from "node:path";

import type { GoldCase } from "../lint-case.ts";
import { ROOT } from "../lint-criteria.ts";

const VITEST_ENTRY = path.join(ROOT, "node_modules", "vitest", "vitest.mjs");
const RUNNER_CONFIG = path.join(import.meta.dirname, "vitest.config.ts");
const REPORT_PATH = "ledger/runner-report.json";
const STDERR_TAIL_CHARS = 2000;

// A package that hangs must not hang the verifier. The full set runs in well under a minute.
const RUNNER_TIMEOUT_MS = 10 * 60 * 1000;

export const CaseStatus = {
  PASS: "PASS",
  FAIL: "FAIL",
  SKIP: "SKIP",
} as const;

export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export interface CaseResult {
  readonly id: string;
  readonly status: CaseStatus;
  readonly durationMs: number;

  // The diff or the error of a failing case. Empty otherwise.
  readonly detail: string;
}

/** Runs every case and returns one result per case, in case order. */
export type CaseRunner = (root: string, casesDir: string, cases: GoldCase[]) => CaseResult[];

interface ReportedTest {
  readonly title: string;
  readonly status: string;
  readonly duration?: number | null;
  readonly failureMessages?: string[];
}

interface Report {
  readonly testResults?: { readonly assertionResults?: ReportedTest[] }[];
}

const STATUS_BY_REPORT: Readonly<Record<string, CaseStatus>> = {
  passed: CaseStatus.PASS,
  failed: CaseStatus.FAIL,
  skipped: CaseStatus.SKIP,
  pending: CaseStatus.SKIP,
};

export const runCasesInWorkerd: CaseRunner = (root, casesDir, cases) => {
  const reportFile = path.join(root, REPORT_PATH);
  mkdirSync(path.dirname(reportFile), { recursive: true });
  rmSync(reportFile, { force: true });

  const child = spawnSync(
    process.execPath,
    [VITEST_ENTRY, "run", "--config", RUNNER_CONFIG, "--reporter=json", "--outputFile", reportFile],
    { env: { ...process.env, MITTENS_ROOT: root, GOLD_DIR: casesDir }, encoding: "utf8", timeout: RUNNER_TIMEOUT_MS },
  );

  // spawnSync reports a timeout as an error and kills the child.
  if (child.error) {
    throw new Error(`case runner did not finish: ${child.error.message}`);
  }

  const reported = readReport(reportFile, child.stderr ?? "");

  return cases.map((goldCase) => toResult(goldCase.id, reported));
};

function readReport(reportFile: string, stderr: string): Map<string, ReportedTest> {
  let report: Report;

  try {
    report = JSON.parse(readFileSync(reportFile, "utf8")) as Report;
  } catch {
    throw new Error(`case runner wrote no report: ${stderr.slice(-STDERR_TAIL_CHARS).trim()}`);
  }

  const tests = (report.testResults ?? []).flatMap((file) => file.assertionResults ?? []);

  return new Map(tests.map((reportedTest) => [reportedTest.title, reportedTest]));
}

function toResult(id: string, reported: Map<string, ReportedTest>): CaseResult {
  const reportedTest = reported.get(id);
  const status = reportedTest ? STATUS_BY_REPORT[reportedTest.status] : undefined;

  if (!reportedTest || !status) {
    throw new Error(`case runner did not report ${id}`);
  }

  return {
    id,
    status,
    durationMs: Math.round(reportedTest.duration ?? 0),
    detail: (reportedTest.failureMessages ?? []).join("\n"),
  };
}
