/**
 * Vitest configuration of the case runner. This file runs in Node; the tests
 * run inside workerd. Node reads the signed cases and every file they name,
 * and hands both to the tests, because workerd has no file system.
 *
 *   MITTENS_ROOT  the repository root (default: two folders up)
 *   GOLD_DIR      the cases folder (default: gold/cases under the root)
 *
 *   Node (this file)                         workerd (cases.test.ts)
 *   cases, named files, harness facts --provide--> adapter --> packages by name
 *   apps/mittens_demo/wrangler.jsonc ------------> the worker the cases run in:
 *                                                  LOADER, CoderAgent, GitHubGate,
 *                                                  GITHUB_TOKEN = the canary
 *
 * The worker is always the demo of this repository, also when MITTENS_ROOT
 * names another folder: the root says where the cases are, not what is tested.
 */

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { cloudflareTest } from "@cloudflare/vitest-plugin";
import agents from "agents/vite";
import { defineConfig } from "vitest/config";

import { Stage, loadCases } from "../lint-case.ts";
import type { GoldCase } from "../lint-case.ts";
import type { RunnableCase } from "./adapter.ts";
import { harnessFacts } from "./harness.ts";

const CASE_TIMEOUT_MS = 30_000;
const PROGRAM_KEY = "program";
const FIXTURES_KEY = "fixtures";
const SCRIPT_KEY = "model_script";
const ARGS_KEY = "args";

// The demo's own configuration gives the cases the bindings the demo has.
const DEMO_WRANGLER = path.join(import.meta.dirname, "..", "..", "apps", "mittens_demo", "wrangler.jsonc");

const CANARY_MODULE = "mittens_attack/canary";
const CANARY_EXPORT = "CANARY_GITHUB_TOKEN";

// Used when the attack package does not export its canary (yet, or any more).
// It is not a real token.
const FALLBACK_CANARY = "ghp_CANARY_TOKEN_MUST_NOT_LEAK_0123456789";

const root = path.resolve(process.env.MITTENS_ROOT ?? path.join(import.meta.dirname, "..", ".."));
const casesDir = path.resolve(root, process.env.GOLD_DIR ?? "gold/cases");
const { cases } = loadCases(casesDir, Stage.SIGNED);

/** The repository files a case names: its fixture and its programs. */
function namedFiles(goldCase: GoldCase): string[] {
  const input = goldCase.input;
  const script = Array.isArray(input[SCRIPT_KEY]) ? (input[SCRIPT_KEY] as Record<string, unknown>[]) : [];
  const args = isRecord(input[ARGS_KEY]) ? input[ARGS_KEY] : {};
  const candidates = [
    input[FIXTURES_KEY],
    input[PROGRAM_KEY],
    ...script.map((step) => step[PROGRAM_KEY]),

    // A contract call may name a fixture and a program in its arguments.
    args[FIXTURES_KEY],
    args[PROGRAM_KEY],
  ];

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * The token value the host holds while the cases run. It comes from the
 * attack package, as in the demo's own tests. A package that cannot be
 * loaded must not stop the configuration, so there is a fallback.
 */
async function canaryToken(): Promise<string> {
  try {
    const loaded = (await import(CANARY_MODULE)) as Record<string, unknown>;
    const canary = loaded[CANARY_EXPORT];

    return typeof canary === "string" && canary !== "" ? canary : FALLBACK_CANARY;
  } catch {
    return FALLBACK_CANARY;
  }
}

export default defineConfig({
  root: import.meta.dirname,
  plugins: [
    // The demo's agent uses decorators; this plugin compiles them.
    agents(),
    cloudflareTest({
      remoteBindings: false,
      wrangler: { configPath: DEMO_WRANGLER },
      miniflare: { bindings: { GITHUB_TOKEN: await canaryToken() } },
    }),
  ],
  test: {
    include: ["cases.test.ts"],
    testTimeout: CASE_TIMEOUT_MS,
    // lint-case.ts has checked each case; the runner's type is the same JSON.
    provide: {
      goldCases: cases as unknown as RunnableCase[],
      goldFiles: readNamedFiles(),
      harnessFacts: harnessFacts(root, casesDir, cases),
    },
  },
});
