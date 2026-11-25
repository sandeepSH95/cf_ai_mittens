/**
 * Domain types shared by the GitHub drivers and the service layer.
 *
 * Nothing above the driver layer sees a GitHub URL, a header, raw JSON
 * or the token. Services only see these shapes.
 */

export const GitHubDriverKind = { Api: "github", Stub: "stub" } as const;
export type GitHubDriverKind = (typeof GitHubDriverKind)[keyof typeof GitHubDriverKind];

/** Filter used by list calls. `all` means open and closed. */
export const IssueState = { Open: "open", Closed: "closed", All: "all" } as const;
export type IssueState = (typeof IssueState)[keyof typeof IssueState];

export type ItemState = "open" | "closed";

export type RepoRef = { owner: string; name: string };

export type PullRequest = {
  number: number;
  title: string;
  state: ItemState;
  author: string;
  createdAt: string;
  updatedAt: string;
  draft: boolean;
  url: string;
  labels: string[];
  body: string | null;
};

export type Issue = {
  number: number;
  title: string;
  state: ItemState;
  author: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: string[];
  body: string | null;
};

export type Comment = {
  id: number;
  author: string;
  body: string;
  createdAt: string;
};

export type Repo = {
  fullName: string;
  description: string | null;
  openIssues: number;
  defaultBranch: string;
};

/** The three write operations the agent can plan. Nothing else is implemented. */
export const WriteKind = {
  Comment: "comment",
  ClosePullRequest: "close_pull_request",
  CloseIssue: "close_issue"
} as const;
export type WriteKind = (typeof WriteKind)[keyof typeof WriteKind];

export type WriteReceipt = { kind: WriteKind; number: number; url: string | null };

/**
 * The driver contract. READ methods are used by the facade (reachable from
 * the sandbox through the gate). WRITE methods are used only by the plan
 * service after a human approved the plan.
 */
export interface GitHubDriver {
  readonly kind: GitHubDriverKind;

  listPullRequests(repo: RepoRef, state: IssueState): Promise<PullRequest[]>;
  getPullRequest(repo: RepoRef, number: number): Promise<PullRequest>;
  listIssues(repo: RepoRef, state: IssueState): Promise<Issue[]>;
  listComments(repo: RepoRef, number: number): Promise<Comment[]>;
  getRepo(repo: RepoRef): Promise<Repo>;

  createComment(repo: RepoRef, number: number, body: string): Promise<WriteReceipt>;
  closePullRequest(repo: RepoRef, number: number): Promise<WriteReceipt>;
  closeIssue(repo: RepoRef, number: number): Promise<WriteReceipt>;
}

/** Parses "owner/name". Throws on anything else. */
export function parseRepoRef(full: string): RepoRef {
  const parts = full.split("/");

  if (parts.length !== 2 || !parts[0] || !parts[1]) {
    throw new Error(`GITHUB_REPO must look like "owner/name", got "${full}"`);
  }

  return { owner: parts[0], name: parts[1] };
}

/** Reads the fixed target repository from env. Generated code cannot change it. */
export function repoFromEnv(env: { GITHUB_REPO?: string }): RepoRef {
  if (!env.GITHUB_REPO) {
    throw new Error('GITHUB_REPO is not set. Add it to wrangler.jsonc vars, for example "octocat/hello-world".');
  }

  return parseRepoRef(env.GITHUB_REPO);
}
