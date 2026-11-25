/**
 * Vitest configuration of the case runner. This file runs in Node; the tests
 * run inside workerd. Node reads the signed cases and every file they name,
 * and hands both to the tests, because workerd has no file system.
 *
 *   MITTENS_ROOT  the repository root (default: two folders up)
 *   GOLD_DIR      the cases folder (default: gold/cases under the root)
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import { defineConfig } from "vitest/config";

import { Stage, loadCases } from "../lint-case.ts";
import type { GoldCase } from "../lint-case.ts";
import type { RunnableCase } from "./adapter.ts";

const COMPATIBILITY_DATE = "2026-11-01";
const CASE_TIMEOUT_MS = 30_000;
const PROGRAM_KEY = "program";
const FIXTURES_KEY = "fixtures";
const SCRIPT_KEY = "model_script";

const root = path.resolve(process.env.MITTENS_ROOT ?? path.join(import.meta.dirname, "..", ".."));
const casesDir = path.resolve(root, process.env.GOLD_DIR ?? "gold/cases");
const { cases } = loadCases(casesDir, Stage.SIGNED);

/** The repository files a case names: its fixture and its programs. */
function namedFiles(goldCase: GoldCase): string[] {
  const input = goldCase.input;
  const script = Array.isArray(input[SCRIPT_KEY]) ? (input[SCRIPT_KEY] as Record<string, unknown>[]) : [];
  const candidates = [input[FIXTURES_KEY], input[PROGRAM_KEY], ...script.map((step) => step[PROGRAM_KEY])];

  return candidates.filter((candidate): candidate is string => typeof candidate === "string");
}

function readNamedFiles(): Record<string, string> {
  const files: Record<string, string> = {};

  for (const relative of new Set(cases.flatMap(namedFiles))) {
    // A held-out case may name a file that lives only beside the held-out cases.
    const inRepository = path.join(root, relative);
    const source = existsSync(inRepository) ? inRepository : path.join(casesDir, relative);

    files[relative] = readFileSync(source, "utf8");
  }

  return files;
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    cloudflareTest({
      miniflare: { compatibilityDate: COMPATIBILITY_DATE, compatibilityFlags: ["nodejs_compat"] },
    }),
  ],
  test: {
    include: ["cases.test.ts"],
    testTimeout: CASE_TIMEOUT_MS,
    // lint-case.ts has checked each case; the runner's type is the same JSON.
    provide: { goldCases: cases as unknown as RunnableCase[], goldFiles: readNamedFiles() },
  },
});
