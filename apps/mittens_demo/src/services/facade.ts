/**
 * Builds the read-only facade (package mittens_gate) over the demo's GitHub drivers.
 *
 * The facade class and the driver interface live in mittens_gate. The driver
 * implementations (REST and stub) live in this app, so the env wiring is here.
 */
import { Facade, repoFromEnv } from "mittens_gate";
import { createGitHubDriver, type GitHubDriverEnv, type StubSource } from "../drivers/github";

export type FacadeEnv = GitHubDriverEnv & { GITHUB_REPO?: string };
export type FacadeSource = StubSource;

/** Builds the facade from env: driver kind, token (host-side only) and repo. A source selects the stub over that fixture. */
export function createFacade(env: FacadeEnv, source?: FacadeSource): Facade {
  return new Facade(createGitHubDriver(env, source), repoFromEnv(env));
}
