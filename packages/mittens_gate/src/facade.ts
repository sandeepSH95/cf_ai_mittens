/**
 * Read-only GitHub facade: the whole surface that generated code can reach.
 *
 *   isolate (no network)   github.listPullRequests({ state: "open" })   shim in mittens_sandbox
 *                                      |  Workers RPC over the loopback binding GH
 *   host, demo gate.ts     GitHubGate.listPullRequests(input)
 *                                      |
 *   host, this file        Facade.listPullRequests(input)               parses input (FACADE_SCHEMAS)
 *                                      |
 *   host, drivers          GitHubDriver.listPullRequests(repo, state)   api.github.com or fixtures
 *
 * No write method exists here on purpose. A program returns writes as a
 * plan (plan.ts) and apply_writes runs it after approval.
 */
import type { ToolDescriptors } from "@cloudflare/codemode/ai";
import { z } from "zod";
import { SANDBOX_NAMESPACE } from "mittens_sandbox";
import { IssueState, type Comment, type GitHubDriver, type Issue, type PullRequest, type Repo, type RepoRef } from "./github-types";

export const FacadeMethod = {
  ListPullRequests: "listPullRequests",
  GetPullRequest: "getPullRequest",
  ListIssues: "listIssues",
  ListComments: "listComments",
  GetRepo: "getRepo"
} as const;
export type FacadeMethod = (typeof FacadeMethod)[keyof typeof FacadeMethod];

/** Method names exposed as `github.<name>` inside the isolate. */
export const FACADE_METHODS: readonly FacadeMethod[] = Object.values(FacadeMethod);

const stateSchema = z.enum([IssueState.Open, IssueState.Closed, IssueState.All] as const).default(IssueState.Open);
const itemNumberSchema = z.number().int().positive();

/** Input schemas. Generated code sends untrusted JSON, so every call is parsed first. */
export const FACADE_SCHEMAS = {
  [FacadeMethod.ListPullRequests]: z.object({ state: stateSchema }),
  [FacadeMethod.GetPullRequest]: z.object({ number: itemNumberSchema }),
  [FacadeMethod.ListIssues]: z.object({ state: stateSchema }),
  [FacadeMethod.ListComments]: z.object({ number: itemNumberSchema }),
  [FacadeMethod.GetRepo]: z.object({})
} as const;

const DESCRIPTIONS: Record<FacadeMethod, string> = {
  [FacadeMethod.ListPullRequests]: "List pull requests of the configured repository. state defaults to open.",
  [FacadeMethod.GetPullRequest]: "Get one pull request by number.",
  [FacadeMethod.ListIssues]: "List issues (not pull requests) of the configured repository. state defaults to open.",
  [FacadeMethod.ListComments]: "List the comments on one issue or pull request, oldest first.",
  [FacadeMethod.GetRepo]: "Get the repository summary."
};

/** Host-side implementation. Every method parses its input before touching the driver; bad input rejects. */
export class Facade {
  readonly #driver: GitHubDriver;
  readonly #repo: RepoRef;

  constructor(driver: GitHubDriver, repo: RepoRef) {
    this.#driver = driver;
    this.#repo = repo;
  }

  async listPullRequests(input?: unknown): Promise<PullRequest[]> {
    const { state } = FACADE_SCHEMAS.listPullRequests.parse(input ?? {});
    return this.#driver.listPullRequests(this.#repo, state);
  }

  async getPullRequest(input?: unknown): Promise<PullRequest> {
    const { number } = FACADE_SCHEMAS.getPullRequest.parse(input ?? {});
    return this.#driver.getPullRequest(this.#repo, number);
  }

  async listIssues(input?: unknown): Promise<Issue[]> {
    const { state } = FACADE_SCHEMAS.listIssues.parse(input ?? {});
    return this.#driver.listIssues(this.#repo, state);
  }

  async listComments(input?: unknown): Promise<Comment[]> {
    const { number } = FACADE_SCHEMAS.listComments.parse(input ?? {});
    return this.#driver.listComments(this.#repo, number);
  }

  async getRepo(input?: unknown): Promise<Repo> {
    FACADE_SCHEMAS.getRepo.parse(input ?? {});
    return this.#driver.getRepo(this.#repo);
  }
}

/** Tool descriptors for createCodeTool. They carry schemas, not execute functions: calls go over RPC. */
export function facadeDescriptors(): ToolDescriptors {
  const descriptors: ToolDescriptors = {};

  for (const method of FACADE_METHODS) {
    descriptors[method] = { description: DESCRIPTIONS[method], inputSchema: FACADE_SCHEMAS[method] };
  }

  return descriptors;
}

/** The TypeScript the model reads. Keep it in step with FACADE_SCHEMAS and github-types.ts. */
const FACADE_TYPES = `type ItemState = "open" | "closed";
type StateFilter = { state?: "open" | "closed" | "all" }; // default "open"
type PullRequest = { number: number; title: string; state: ItemState; author: string; createdAt: string; updatedAt: string; draft: boolean; url: string; labels: string[]; body: string | null };
type Issue = { number: number; title: string; state: ItemState; author: string; createdAt: string; updatedAt: string; url: string; labels: string[]; body: string | null };
type Comment = { id: number; author: string; body: string; createdAt: string };
type Repo = { fullName: string; description: string | null; openIssues: number; defaultBranch: string };

/** Read-only. The repository is fixed by the host; you cannot pick another one. Dates are ISO 8601 strings. */
declare const ${SANDBOX_NAMESPACE}: {
  ${FacadeMethod.ListPullRequests}(input?: StateFilter): Promise<PullRequest[]>;
  ${FacadeMethod.GetPullRequest}(input: { number: number }): Promise<PullRequest>;
  ${FacadeMethod.ListIssues}(input?: StateFilter): Promise<Issue[]>;
  ${FacadeMethod.ListComments}(input: { number: number }): Promise<Comment[]>;
  ${FacadeMethod.GetRepo}(): Promise<Repo>;
};`;

/** Describes the facade to the model. */
export function spec(): string {
  return FACADE_TYPES;
}

/**
 * A fixed, valid program for the facade. Shown to the model as the example
 * and returned by the stub model driver so the whole loop runs offline.
 * With the fixtures it makes 6 facade calls and plans 5 comments.
 */
export const EXAMPLE_PROGRAM = `async () => {
  const DAY_MS = 24 * 60 * 60 * 1000;
  const STALE_DAYS = 30;
  const now = Date.now();

  const open = await ${SANDBOX_NAMESPACE}.${FacadeMethod.ListPullRequests}({ state: "open" });
  const stale = open.filter((pr) => !pr.draft && (now - Date.parse(pr.updatedAt)) / DAY_MS > STALE_DAYS);

  const writes = [];
  for (const pr of stale) {
    const comments = await ${SANDBOX_NAMESPACE}.${FacadeMethod.ListComments}({ number: pr.number });
    const lastVoice = comments.length > 0 ? comments[comments.length - 1].author : "nobody";
    writes.push({
      kind: "comment",
      number: pr.number,
      body: "This pull request has had no activity for more than " + STALE_DAYS + " days (last comment by " + lastVoice + "). Please rebase it or close it."
    });
  }

  return {
    summary: stale.length + " of " + open.length + " open pull requests are stale.",
    stale: stale.map((pr) => ({ number: pr.number, title: pr.title, updatedAt: pr.updatedAt })),
    plan: { writes }
  };
}`;
