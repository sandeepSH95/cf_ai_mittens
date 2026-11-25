/**
 * Builds the plan applier (package mittens_gate) over the demo's GitHub drivers.
 *
 * applyPlan and the plan schema live in mittens_gate. The driver
 * implementations (REST and stub) live in this app, so the env wiring is here.
 */
import { applyPlan, repoFromEnv, type PlanApplier } from "mittens_gate";
import { createGitHubDriver, type GitHubDriverEnv } from "../drivers/github";

export type PlanEnv = GitHubDriverEnv & { GITHUB_REPO?: string };

/** Builds the applier from env. The driver (and the token) stay on the host. */
export function createPlanApplier(env: PlanEnv): PlanApplier {
  const driver = createGitHubDriver(env);
  const repo = repoFromEnv(env);

  return (plan) => applyPlan(driver, repo, plan);
}
