/**
 * The seam: the one place where a test replaces the two drivers of one agent.
 *
 *   testing entry -- replaceDrivers("verify-G-028", { github, model }) --+
 *                                                                        v
 *   agent "verify-G-028" --> services --> githubDriverFor / modelDriverFor --> the replacement
 *   every other agent ----> services --> githubDriverFor / modelDriverFor --> the driver env selects
 *
 * A scope is the name of an agent instance. The gate entrypoint, the apply
 * tool and the turn all ask with the same scope, so the three share one
 * GitHub driver and one model driver. Nothing but the drivers is replaced.
 * With no replacement (always the case outside a test) env decides.
 */
import type { GitHubDriver } from "mittens_gate";
import { createGitHubDriver, type GitHubDriverEnv, type StubSource } from "../drivers/github";
import { createModelDriver, type ModelDriver, type ModelDriverEnv, type StubScript } from "../drivers/model";

export type DriverReplacement = { github: GitHubDriver; model: ModelDriver };

/** Who asks for a driver. `source` selects the stub over one fixture; `scope` names the agent instance. */
export type DriverScope = { scope?: string; source?: StubSource };

const replacements = new Map<string, DriverReplacement>();

/** Example: replaceDrivers("verify-G-028", { github: stub, model: scripted }). */
export function replaceDrivers(scope: string, replacement: DriverReplacement): void {
  replacements.set(scope, replacement);
}

/** Gives the scope back to the drivers env selects. */
export function restoreDrivers(scope: string): void {
  replacements.delete(scope);
}

export function githubDriverFor(env: GitHubDriverEnv, where: DriverScope = {}): GitHubDriver {
  return replacementFor(where.scope)?.github ?? createGitHubDriver(env, where.source);
}

export function modelDriverFor(env: ModelDriverEnv, script: StubScript, scope?: string): ModelDriver {
  return replacementFor(scope)?.model ?? createModelDriver(env, script);
}

function replacementFor(scope: string | undefined): DriverReplacement | undefined {
  return scope === undefined ? undefined : replacements.get(scope);
}
