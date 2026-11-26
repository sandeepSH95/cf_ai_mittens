/**
 * GitHubGate: the host-side entrypoint the sandbox reaches over RPC.
 *
 *   isolate ---- env.GH.listPullRequests(input) ----> GitHubGate (this Worker, host side)
 *                 loopback binding from ctx.exports       |  this.env.GITHUB_TOKEN lives here
 *                 carries props { runId }, never a token  v
 *                                                       Facade -> GitHubDriver -> api.github.com
 *
 * Only READ methods are defined. There is no createComment or close method
 * on this class, so generated code that bypasses the `github` wrapper and
 * calls env.GH directly still cannot write. Writes go through apply_writes.
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import type { Facade } from "mittens_gate";
import { createReads, type FacadeSource } from "./services/facade";

/**
 * `source` is set by the testing entry only: the reads then come from that fixture.
 * `scope` is the name of the agent that made the handle (services/seam.ts).
 */
export type GateProps = { runId: string; source?: FacadeSource; scope?: string };

export class GitHubGate extends WorkerEntrypoint<Env, GateProps> {
  listPullRequests(input?: unknown) {
    return this.#facade().listPullRequests(input);
  }

  getPullRequest(input?: unknown) {
    return this.#facade().getPullRequest(input);
  }

  listIssues(input?: unknown) {
    return this.#facade().listIssues(input);
  }

  listComments(input?: unknown) {
    return this.#facade().listComments(input);
  }

  getRepo(input?: unknown) {
    return this.#facade().getRepo(input);
  }

  #facade(): Facade {
    return createReads(this.env, this.ctx.props).facade;
  }
}
