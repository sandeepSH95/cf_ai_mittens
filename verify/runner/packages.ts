/**
 * Loads the code under test by package name, one export at a time.
 *
 *   loadExport(Exports.createSandbox)
 *        |  import("mittens_sandbox")      dynamic: a missing export fails
 *        v                                 one case, never the whole run
 *   the function, or ContractError("contract: mittens_sandbox must export createSandbox(options)")
 *
 *   guarded("execute(program)", action)    a throw inside a package becomes
 *                                          one contract line, not a crash
 *
 * verify/runner/CONTRACT.md lists every export named here. This file runs
 * inside workerd: no Node imports.
 */

import { env } from "cloudflare:workers";

import type { Json } from "../normalise.ts";
import { contractLine, mustExport } from "./lines.ts";

const LOADER_BINDING = "LOADER";
const TOKEN_BINDING = "GITHUB_TOKEN";
const SIGNATURE_OPEN = "(";

// Example: "The requested module does not provide..." is cut to this length, so the line stays short.
const CAUSE_MAX_CHARS = 60;

const SANDBOX_PACKAGE = "mittens_sandbox";
const GATE_PACKAGE = "mittens_gate";
const ATTACK_PACKAGE = "mittens_attack";
const TESTING_ENTRY = "mittens_demo/testing";

export interface ExportSpec {
  readonly from: string;

  // The call as CONTRACT.md writes it. The export name is the text before "(".
  readonly signature: string;
}

/** Every export the adapter reads. CONTRACT.md documents each one. */
export const Exports = {
  createSandbox: { from: SANDBOX_PACKAGE, signature: "createSandbox(options)" },
  defineReads: { from: GATE_PACKAGE, signature: "defineReads(reads)" },
  defineWrites: { from: GATE_PACKAGE, signature: "defineWrites(writes)" },
  attackSandbox: { from: ATTACK_PACKAGE, signature: "attackSandbox({ execute, canary })" },
  openGate: { from: TESTING_ENTRY, signature: "openGate(source?)" },
  agentParts: { from: TESTING_ENTRY, signature: "agentParts()" },
  runScriptedCase: { from: TESTING_ENTRY, signature: "runScriptedCase(input)" },
} as const satisfies Record<string, ExportSpec>;

/** A function of a package. The adapter checks what it returns at run time. */
export type PackageFunction = (...args: unknown[]) => unknown;

/** A failure of the code under test. Its message is one contract line. */
export class ContractError extends Error {}

/** Stops the case with one contract line. */
export function fail(text: string): never {
  throw new ContractError(contractLine(text));
}

/** Returns the named export, or stops the case when it is not a function. */
export async function loadExport(spec: ExportSpec): Promise<PackageFunction> {
  const exportName = spec.signature.split(SIGNATURE_OPEN)[0] ?? spec.signature;
  let loaded: Record<string, unknown>;

  try {
    // The name is a variable so the bundler does not resolve it at build time.
    loaded = (await import(/* @vite-ignore */ spec.from)) as Record<string, unknown>;
  } catch (failure) {
    const cause = messageOf(failure).slice(0, CAUSE_MAX_CHARS).trim();

    return fail(`${mustExport(spec.from, spec.signature)} (import failed: ${cause}...)`);
  }

  const candidate = loaded[exportName];

  if (typeof candidate !== "function") {
    return fail(mustExport(spec.from, spec.signature));
  }

  return candidate as PackageFunction;
}

/** Runs package code. A throw becomes one contract line that names the call. */
export async function guarded<T>(label: string, action: () => T | Promise<T>): Promise<T> {
  try {
    return await action();
  } catch (failure) {
    if (failure instanceof ContractError) {
      throw failure;
    }

    return fail(`${label} threw ${nameOf(failure)}: ${messageOf(failure)}`);
  }
}

/** Returns the value as an object, or stops the case and names what was expected. */
export function expectObject(value: unknown, expected: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail(expected);
  }

  return value as Record<string, unknown>;
}

/** Makes a package value safe to compare: undefined becomes null, the rest is JSON. */
export function toJson(value: unknown, label: string): Json {
  if (value === undefined) {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(value) ?? "null") as Json;
  } catch (failure) {
    return fail(`${label} is not a JSON value: ${messageOf(failure)}`);
  }
}

/** The text of a file a case names. Example: fileText(files, "fixtures/repo-small.json"). */
export function fileText(files: Record<string, string>, name: unknown): string {
  const text = typeof name === "string" ? files[name] : undefined;

  if (text === undefined) {
    return fail(`the case names a file the runner did not load: ${String(name)}`);
  }

  return text;
}

/** The Worker Loader binding of the demo. Example use: createSandbox({ loader }). */
export function loaderBinding(): unknown {
  const loader = env[LOADER_BINDING];

  if (loader === undefined) {
    return fail(`the runner's worker must have the Worker Loader binding ${LOADER_BINDING}`);
  }

  return loader;
}

/** The token value the host holds in this run. The attack suite looks for it. */
export function canaryToken(): string {
  const token = env[TOKEN_BINDING];

  if (typeof token !== "string" || token === "") {
    return fail(`the runner's worker must hold the canary in ${TOKEN_BINDING}`);
  }

  return token;
}

export function nameOf(failure: unknown): string {
  const name = (failure as { name?: unknown } | null)?.name;

  return typeof name === "string" ? name : typeof failure;
}

export function messageOf(failure: unknown): string {
  const message = (failure as { message?: unknown } | null)?.message;

  return typeof message === "string" ? message : String(failure);
}
