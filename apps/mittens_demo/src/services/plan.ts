/**
 * Builds the writes (package mittens_gate) over the demo's GitHub drivers.
 *
 * The write kinds and the plan validation live in mittens_gate. The driver
 * implementations (REST and stub) live in this app, so the env wiring is here.
 */
import { githubWrites, repoFromEnv, type GitHubWrites } from "mittens_gate";
import { createGitHubDriver, type GitHubDriverEnv } from "../drivers/github";

export type PlanEnv = GitHubDriverEnv & { GITHUB_REPO?: string };

/** Builds { planSpec, validatePlan, applyWritesTool } from env. The driver (and the token) stay on the host. */
export function createWrites(env: PlanEnv): GitHubWrites {
  return githubWrites(createGitHubDriver(env), repoFromEnv(env));
}
