/**
 * PreToolUse hook. It refuses a tool call before the call runs.
 *
 *   tool call (JSON on stdin) --> verdict() --> null       exit 0, the call runs
 *                                          --> a reason    exit 2, the agent reads the reason
 *
 * Two rule sets:
 *   always on       no wrangler deploy, login or secret; no git push. A human does these.
 *   builder passes  (MITTENS_LOOP=1, set by loop/loop.ts) no write inside the fence,
 *                   and no access at all to the held-out set.
 *
 * The Bash rule reads the command text. It stops the plain mistakes, not a
 * builder that hides a path on purpose. The manifest check in verify/manifest.ts
 * is the fence that cannot be talked around: a changed fenced byte is exit 3.
 */

import path from "node:path";

import { FENCED_DIRS, MANIFEST_PATH } from "../../verify/manifest.ts";

const LOOP_VARIABLE = "MITTENS_LOOP";
const LOOP_ON = "1";
const PROJECT_VARIABLE = "CLAUDE_PROJECT_DIR";

const EXIT_ALLOW = 0;
const EXIT_DENY = 2;

const BASH_TOOL = "Bash";
const WRITE_TOOLS: readonly string[] = ["Edit", "Write", "MultiEdit", "NotebookEdit"];

// The keys of a tool input that can hold a path. Example: Grep has "path".
const PATH_KEYS: readonly string[] = ["file_path", "notebook_path", "path", "pattern"];

const HELD_OUT_NAME = "mittens_holdout";
const FENCED: readonly string[] = [...FENCED_DIRS, MANIFEST_PATH];

const HUMAN_STEP = "deploy and secrets are human steps";
const PUSH_STEP = "git push is a human step";
const HELD_OUT_REASON = `fenced path: ${HELD_OUT_NAME}. Stop and report.`;

// Example: "npx wrangler versions deploy" and "wrangler secret put X".
const WRANGLER_HUMAN = /\bwrangler\b[^;&|\n]*\b(secret|login|deploy|publish)\b/;
const GIT_PUSH = /\bgit\b[^;&|\n]*\bpush\b/;

// A command is cut into segments here. Example: "a && b | c" has three.
const SEGMENT_END = /&&|\|\||[;|\n]/;
const REDIRECT_TARGET = />>?\s*([^\s;&|]+)/g;
const ENV_PREFIX = /^[A-Za-z_][A-Za-z0-9_]*=/;
const QUOTES = /["'`]/g;

// Commands that only read. A fenced path is allowed after one of these.
const READERS: readonly string[] = ["cat", "head", "tail", "less", "wc", "ls", "grep", "rg", "diff", "file", "stat", "shasum", "sed", "find", "git"];
const GIT_READERS: readonly string[] = ["diff", "log", "show", "status", "blame", "ls-files"];
const FIND_WRITERS: readonly string[] = ["-delete", "-exec", "-execdir", "-ok"];
const SED_IN_PLACE = /^(-[a-zA-Z]*i|--in-place)/;

// The fenced programs a builder runs. Example: "sh verify/run.sh".
const RUNNERS: Readonly<Record<string, readonly string[]>> = {
  sh: ["verify/run.sh"],
  bash: ["verify/run.sh"],
  node: ["verify/lint-case.ts", "verify/manifest.ts", "verify/lint-criteria.ts"],
};

export const Mode = {
  // An interactive session with a human: only the always-on rules.
  INTERACTIVE: "interactive",

  // A headless builder pass of the loop: the fence rules too.
  BUILDER: "builder",
} as const;

export type Mode = (typeof Mode)[keyof typeof Mode];

export interface ToolCall {
  readonly tool_name?: string;
  readonly tool_input?: Record<string, unknown>;
  readonly cwd?: string;
}

/** Returns the reason the call is refused, or null when it may run. */
export function verdict(call: ToolCall, mode: Mode, root: string): string | null {
  const input = call.tool_input ?? {};
  const command = call.tool_name === BASH_TOOL ? String(input.command ?? "") : null;

  if (command !== null && WRANGLER_HUMAN.test(command)) {
    return HUMAN_STEP;
  }

  if (command !== null && GIT_PUSH.test(command)) {
    return PUSH_STEP;
  }

  if (mode !== Mode.BUILDER) {
    return null;
  }

  if (command !== null) {
    return bashVerdict(command, root, call.cwd ?? root);
  }

  return fileVerdict(call, root);
}

/** A file tool: no access to the held-out set, no write inside the fence. */
function fileVerdict(call: ToolCall, root: string): string | null {
  const input = call.tool_input ?? {};
  const paths = PATH_KEYS.map((key) => input[key]).filter((value) => typeof value === "string") as string[];

  if (paths.some((candidate) => candidate.includes(HELD_OUT_NAME))) {
    return HELD_OUT_REASON;
  }

  if (!WRITE_TOOLS.includes(call.tool_name ?? "")) {
    return null;
  }

  const fenced = paths.map((candidate) => fencedPath(candidate, root, call.cwd ?? root)).find((found) => found !== null);

  return fenced ? refusal(fenced) : null;
}

/** A shell command: each segment that names a fenced path must only read it. */
function bashVerdict(command: string, root: string, cwd: string): string | null {
  if (command.includes(HELD_OUT_NAME)) {
    return HELD_OUT_REASON;
  }

  for (const segment of command.split(SEGMENT_END)) {
    const fenced = segmentVerdict(segment, root, cwd);

    if (fenced) {
      return refusal(fenced);
    }
  }

  return null;
}

/** Returns the fenced path a segment may change, or null. */
function segmentVerdict(segment: string, root: string, cwd: string): string | null {
  // Example: "FOO=1 cat 'verify/run.ts'" -> ["cat", "verify/run.ts"].
  const words = segment
    .trim()
    .split(/\s+/)
    .map((word) => word.replace(QUOTES, ""))
    .filter((word) => word !== "" && !ENV_PREFIX.test(word));

  for (const match of segment.matchAll(REDIRECT_TARGET)) {
    const target = fencedPath(String(match[1]).replace(QUOTES, ""), root, cwd);

    if (target) {
      return target;
    }
  }

  const fenced = words.map((word) => fencedWord(word, root, cwd)).find((found) => found !== null) ?? null;

  if (!fenced || onlyReads(words)) {
    return null;
  }

  return fenced;
}

function onlyReads(words: string[]): boolean {
  const [program, first] = words;

  if (program === undefined) {
    return true;
  }

  if ((RUNNERS[program] ?? []).includes(first ?? "")) {
    return true;
  }

  if (!READERS.includes(program)) {
    return false;
  }

  if (program === "git") {
    return GIT_READERS.includes(first ?? "");
  }

  if (program === "sed") {
    return !words.some((word) => SED_IN_PLACE.test(word));
  }

  if (program === "find") {
    return !words.some((word) => FIND_WRITERS.includes(word));
  }

  return true;
}

/** Example: "--file=verify/run.ts" names the fenced path "verify/run.ts". */
function fencedWord(word: string, root: string, cwd: string): string | null {
  const value = word.includes("=") ? word.slice(word.indexOf("=") + 1) : word;

  return fencedPath(value, root, cwd);
}

/** Returns the path relative to the root when it is inside the fence. */
function fencedPath(candidate: string, root: string, cwd: string): string | null {
  if (candidate === "" || candidate.startsWith("-")) {
    return null;
  }

  const relative = path.relative(root, path.resolve(cwd, candidate)).split(path.sep).join("/");
  const inside = FENCED.some((fenced) => relative === fenced || relative.startsWith(`${fenced}/`));

  return inside ? relative : null;
}

function refusal(fenced: string): string {
  return `fenced path: ${fenced}. Stop and report.`;
}

async function readStdin(): Promise<string> {
  let text = "";

  for await (const chunk of process.stdin) {
    text += chunk;
  }

  return text;
}

async function main(): Promise<number> {
  const call = JSON.parse(await readStdin()) as ToolCall;
  const mode = process.env[LOOP_VARIABLE] === LOOP_ON ? Mode.BUILDER : Mode.INTERACTIVE;
  const root = process.env[PROJECT_VARIABLE] ?? path.resolve(import.meta.dirname, "../..");
  const reason = verdict(call, mode, root);

  if (reason === null) {
    return EXIT_ALLOW;
  }

  console.error(reason);
  return EXIT_DENY;
}

if (import.meta.main) {
  process.exitCode = await main();
}
