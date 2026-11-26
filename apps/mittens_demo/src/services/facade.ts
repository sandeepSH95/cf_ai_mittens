/**
 * Builds the read-only facade (package mittens_gate) over the demo's GitHub drivers.
 *
 * The facade class and the driver interface live in mittens_gate. The driver
 * implementations (REST and stub) live in this app, so the env wiring is here.
 */
import { githubReads, repoFromEnv, type GitHubReads } from "mittens_gate";
import type { GitHubDriverEnv, StubSource } from "../drivers/github";
import { githubDriverFor, type DriverScope } from "./seam";

export type FacadeEnv = GitHubDriverEnv & { GITHUB_REPO?: string };
export type FacadeSource = StubSource;

/**
 * Builds the reads ({ facade, spec }) from env: driver kind, token (host-side only) and repo.
 * A source selects the stub over that fixture. A scope names the agent that asks (services/seam.ts).
 */
export function createReads(env: FacadeEnv, where: DriverScope = {}): GitHubReads {
  return githubReads(githubDriverFor(env, where), repoFromEnv(env));
}
