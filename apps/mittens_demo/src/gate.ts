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
 *
 * Every read is counted here, on the host, before it runs. The same bypass
 * of the `github` wrapper is then counted too (APP-003).
 */
import { WorkerEntrypoint } from "cloudflare:workers";
import type { Facade } from "mittens_gate";
import { createReads, type FacadeSource } from "./services/facade";
import { reportGateCall } from "./services/gate-meter";

/**
 * `source` is set by the testing entry only: the reads then come from that fixture.
 * `scope` is the name of the agent that made the handle (services/seam.ts).
 */
export type GateProps = { runId: string; source?: FacadeSource; scope?: string };

export class GitHubGate extends WorkerEntrypoint<Env, GateProps> {
  async listPullRequests(input?: unknown) {
    await this.#count();
    return this.#facade().listPullRequests(input);
  }

  async getPullRequest(input?: unknown) {
    await this.#count();
    return this.#facade().getPullRequest(input);
  }

  async listIssues(input?: unknown) {
    await this.#count();
    return this.#facade().listIssues(input);
  }

  async listComments(input?: unknown) {
    await this.#count();
    return this.#facade().listComments(input);
  }

  async getRepo(input?: unknown) {
    await this.#count();
    return this.#facade().getRepo(input);
  }

  // A read that cannot be counted does not run: the ledger must not miss a call.
  #count(): Promise<void> {
    return reportGateCall(this.env, this.ctx.props);
  }

  #facade(): Facade {
    return createReads(this.env, this.ctx.props).facade;
  }
}
