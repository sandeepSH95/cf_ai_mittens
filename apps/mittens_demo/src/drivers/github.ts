/**
 * GitHub driver layer.
 *
 *   mittens_gate (facade.ts, plan.ts)
 *            │  domain types only (PullRequest, Issue, Comment, Repo)
 *            ▼
 *   GitHubDriver (interface, mittens_gate github-types.ts)
 *     ├── GitHubApiDriver   fetch api.github.com, Bearer token from env.GITHUB_TOKEN
 *     └── StubGitHubDriver  src/fixtures/github.json, no network (github-stub.ts)
 *
 * Selected by the GITHUB_DRIVER variable: "github" | "stub" (default "stub").
 */
import {
  GitHubDriverKind,
  WriteKind,
  type Comment,
  type GitHubDriver,
  type Issue,
  type IssueState,
  type ItemState,
  type PullRequest,
  type Repo,
  type RepoRef,
  type WriteReceipt
} from "mittens_gate";
import { StubGitHubDriver } from "./github-stub";

export type { Comment, GitHubDriver, Issue, PullRequest, Repo, RepoRef, WriteReceipt } from "mittens_gate";
export { GitHubDriverKind, IssueState, WriteKind, parseRepoRef, repoFromEnv } from "mittens_gate";

const GITHUB_API_BASE = "https://api.github.com";
const GITHUB_ACCEPT = "application/vnd.github+json";
const GITHUB_API_VERSION_HEADER = "X-GitHub-Api-Version";
const GITHUB_API_VERSION = "2022-11-28";
const USER_AGENT = "cf_ai_keyless_codemode";
const PER_PAGE = "100";
const HTTP_OK_MIN = 200;
const HTTP_OK_MAX = 299;

const HttpMethod = { Get: "GET", Post: "POST", Patch: "PATCH" } as const;
type HttpMethod = (typeof HttpMethod)[keyof typeof HttpMethod];

/** Minimal slices of the GitHub REST JSON. Only the fields we map. */
type RawUser = { login: string } | null;
type RawLabel = { name: string };
type RawPull = {
  number: number;
  title: string;
  state: ItemState;
  user: RawUser;
  created_at: string;
  updated_at: string;
  draft?: boolean;
  html_url: string;
  labels: RawLabel[];
  body: string | null;
};
type RawIssue = Omit<RawPull, "draft"> & { pull_request?: unknown };
type RawComment = { id: number; user: RawUser; body: string; created_at: string };
type RawRepo = {
  full_name: string;
  description: string | null;
  open_issues_count: number;
  default_branch: string;
};

const UNKNOWN_AUTHOR = "unknown";

function toPullRequest(raw: RawPull): PullRequest {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    author: raw.user?.login ?? UNKNOWN_AUTHOR,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    draft: raw.draft ?? false,
    url: raw.html_url,
    labels: raw.labels.map((label) => label.name),
    body: raw.body
  };
}

function toIssue(raw: RawIssue): Issue {
  return {
    number: raw.number,
    title: raw.title,
    state: raw.state,
    author: raw.user?.login ?? UNKNOWN_AUTHOR,
    createdAt: raw.created_at,
    updatedAt: raw.updated_at,
    url: raw.html_url,
    labels: raw.labels.map((label) => label.name),
    body: raw.body
  };
}

function toComment(raw: RawComment): Comment {
  return {
    id: raw.id,
    author: raw.user?.login ?? UNKNOWN_AUTHOR,
    body: raw.body,
    createdAt: raw.created_at
  };
}

/** Real implementation. The token lives here and in env, nowhere else. */
export class GitHubApiDriver implements GitHubDriver {
  readonly kind = GitHubDriverKind.Api;
  readonly #token: string;

  constructor(token: string) {
    this.#token = token;
  }

  async listPullRequests(repo: RepoRef, state: IssueState): Promise<PullRequest[]> {
    const raw = await this.#request<RawPull[]>(HttpMethod.Get, `${repoPath(repo)}/pulls`, { state, per_page: PER_PAGE });
    return raw.map(toPullRequest);
  }

  async getPullRequest(repo: RepoRef, number: number): Promise<PullRequest> {
    const raw = await this.#request<RawPull>(HttpMethod.Get, `${repoPath(repo)}/pulls/${number}`);
    return toPullRequest(raw);
  }

  async listIssues(repo: RepoRef, state: IssueState): Promise<Issue[]> {
    const raw = await this.#request<RawIssue[]>(HttpMethod.Get, `${repoPath(repo)}/issues`, { state, per_page: PER_PAGE });

    // The issues endpoint also returns pull requests. Keep only real issues.
    return raw.filter((item) => item.pull_request === undefined).map(toIssue);
  }

  async listComments(repo: RepoRef, number: number): Promise<Comment[]> {
    const raw = await this.#request<RawComment[]>(HttpMethod.Get, `${repoPath(repo)}/issues/${number}/comments`, { per_page: PER_PAGE });
    return raw.map(toComment);
  }

  async getRepo(repo: RepoRef): Promise<Repo> {
    const raw = await this.#request<RawRepo>(HttpMethod.Get, repoPath(repo));

    return {
      fullName: raw.full_name,
      description: raw.description,
      openIssues: raw.open_issues_count,
      defaultBranch: raw.default_branch
    };
  }

  async createComment(repo: RepoRef, number: number, body: string): Promise<WriteReceipt> {
    const raw = await this.#request<{ html_url: string }>(HttpMethod.Post, `${repoPath(repo)}/issues/${number}/comments`, undefined, { body });
    return { kind: WriteKind.Comment, number, url: raw.html_url };
  }

  async closePullRequest(repo: RepoRef, number: number): Promise<WriteReceipt> {
    const raw = await this.#request<{ html_url: string }>(HttpMethod.Patch, `${repoPath(repo)}/pulls/${number}`, undefined, { state: "closed" });
    return { kind: WriteKind.ClosePullRequest, number, url: raw.html_url };
  }

  async closeIssue(repo: RepoRef, number: number): Promise<WriteReceipt> {
    const raw = await this.#request<{ html_url: string }>(HttpMethod.Patch, `${repoPath(repo)}/issues/${number}`, undefined, { state: "closed" });
    return { kind: WriteKind.CloseIssue, number, url: raw.html_url };
  }

  // One place builds the request, signs it and checks the status.
  async #request<T>(method: HttpMethod, path: string, query?: Record<string, string>, body?: unknown): Promise<T> {
    const url = new URL(GITHUB_API_BASE + path);

    for (const [key, value] of Object.entries(query ?? {})) {
      url.searchParams.set(key, value);
    }

    const headers: Record<string, string> = {
      Accept: GITHUB_ACCEPT,
      Authorization: `Bearer ${this.#token}`,
      [GITHUB_API_VERSION_HEADER]: GITHUB_API_VERSION,
      "User-Agent": USER_AGENT
    };

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });

    if (response.status < HTTP_OK_MIN || response.status > HTTP_OK_MAX) {
      throw new Error(`GitHub ${method} ${path} failed with HTTP ${response.status}`);
    }

    return (await response.json()) as T;
  }
}

function repoPath(repo: RepoRef): string {
  return `/repos/${repo.owner}/${repo.name}`;
}

export type GitHubDriverEnv = { GITHUB_DRIVER?: string; GITHUB_TOKEN?: string };

/** Picks the driver from GITHUB_DRIVER. The stub needs no token. */
export function createGitHubDriver(env: GitHubDriverEnv): GitHubDriver {
  const kind = env.GITHUB_DRIVER ?? GitHubDriverKind.Stub;

  if (kind === GitHubDriverKind.Stub) {
    return new StubGitHubDriver();
  }

  if (kind !== GitHubDriverKind.Api) {
    throw new Error(`Unknown GITHUB_DRIVER "${kind}". Use "github" or "stub".`);
  }

  if (!env.GITHUB_TOKEN) {
    throw new Error("GITHUB_DRIVER=github needs GITHUB_TOKEN (wrangler secret put GITHUB_TOKEN)");
  }

  return new GitHubApiDriver(env.GITHUB_TOKEN);
}
