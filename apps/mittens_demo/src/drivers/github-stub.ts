/**
 * Fixture-backed GitHub driver. No network, no token.
 *
 * Dates in the fixture are stored as "days ago" so the data stays stable:
 * pull request 101 is always 90 days old, whatever today is.
 * Writes are recorded in memory so tests can assert what was applied.
 * Read calls are counted, so a test can prove that a refused read never
 * reached the driver.
 */
import defaultFixture from "../fixtures/github.json";
import {
  GitHubDriverKind,
  IssueState,
  WriteKind,
  type Comment,
  type GitHubDriver,
  type Issue,
  type ItemState,
  type PullRequest,
  type Repo,
  type RepoRef,
  type WriteReceipt
} from "mittens_gate";

const DAY_MS = 24 * 60 * 60 * 1000;
const FIXTURE_URL_BASE = "https://github.com";

type FixturePull = {
  number: number;
  title: string;
  state: ItemState;
  author: string;
  createdDaysAgo: number;
  updatedDaysAgo: number;
  draft: boolean;
  labels: string[];
  body: string | null;
};
type FixtureIssue = Omit<FixturePull, "draft">;
type FixtureComment = { id: number; author: string; body: string; createdDaysAgo: number };
type Fixture = typeof defaultFixture;

/**
 * Replaces the built-in fixture and the clock. For tests and the verifier.
 * Example: { fixture: "<JSON text in the shape of github.json>", now: "2026-11-01T00:00:00Z" }.
 */
export type StubSource = { fixture: string; now: string | null };

/** One write as the stub received it, in the shape of a plan write. Example: { kind: "comment", number: 101, body: "Stale." }. */
export type StubWrite = { kind: WriteKind; number: number; body?: string };

function daysAgo(now: number, days: number): string {
  return new Date(now - days * DAY_MS).toISOString();
}

export class StubGitHubDriver implements GitHubDriver {
  readonly kind = GitHubDriverKind.Stub;
  readonly #pulls: PullRequest[];
  readonly #issues: Issue[];
  readonly #comments: Map<number, Comment[]>;
  readonly #repo: Repo;
  readonly #writes: WriteReceipt[] = [];
  readonly #received: StubWrite[] = [];
  #readCalls = 0;

  constructor(source?: StubSource) {
    const fixture = source === undefined ? defaultFixture : (JSON.parse(source.fixture) as Fixture);
    // No source, or a source with no clock: the dates count back from today.
    const now = typeof source?.now === "string" ? Date.parse(source.now) : Date.now();
    const base = `${FIXTURE_URL_BASE}/${fixture.repo.fullName}`;

    this.#repo = { ...fixture.repo };

    this.#pulls = (fixture.pullRequests as FixturePull[]).map((pull) => ({
      number: pull.number,
      title: pull.title,
      state: pull.state,
      author: pull.author,
      createdAt: daysAgo(now, pull.createdDaysAgo),
      updatedAt: daysAgo(now, pull.updatedDaysAgo),
      draft: pull.draft,
      url: `${base}/pull/${pull.number}`,
      labels: [...pull.labels],
      body: pull.body
    }));

    this.#issues = (fixture.issues as FixtureIssue[]).map((issue) => ({
      number: issue.number,
      title: issue.title,
      state: issue.state,
      author: issue.author,
      createdAt: daysAgo(now, issue.createdDaysAgo),
      updatedAt: daysAgo(now, issue.updatedDaysAgo),
      url: `${base}/issues/${issue.number}`,
      labels: [...issue.labels],
      body: issue.body
    }));

    this.#comments = new Map();

    for (const [number, comments] of Object.entries(fixture.comments as Record<string, FixtureComment[]>)) {
      this.#comments.set(
        Number(number),
        comments.map((comment) => ({
          id: comment.id,
          author: comment.author,
          body: comment.body,
          createdAt: daysAgo(now, comment.createdDaysAgo)
        }))
      );
    }
  }

  /** Writes applied through this instance, in order. For tests. */
  writes(): readonly WriteReceipt[] {
    return [...this.#writes];
  }

  /** The writes this instance received, in order, each in the shape of a plan write. For tests. */
  receivedWrites(): readonly StubWrite[] {
    return this.#received.map((write) => ({ ...write }));
  }

  /** The number of read calls that reached this instance. For tests. */
  readCalls(): number {
    return this.#readCalls;
  }

  async listPullRequests(_repo: RepoRef, state: IssueState): Promise<PullRequest[]> {
    this.#readCalls += 1;
    return this.#pulls.filter((pull) => matchesState(pull.state, state));
  }

  async getPullRequest(_repo: RepoRef, number: number): Promise<PullRequest> {
    this.#readCalls += 1;
    return this.#findPull(number);
  }

  async listIssues(_repo: RepoRef, state: IssueState): Promise<Issue[]> {
    this.#readCalls += 1;
    return this.#issues.filter((issue) => matchesState(issue.state, state));
  }

  async listComments(_repo: RepoRef, number: number): Promise<Comment[]> {
    this.#readCalls += 1;
    return [...(this.#comments.get(number) ?? [])];
  }

  async getRepo(_repo: RepoRef): Promise<Repo> {
    this.#readCalls += 1;
    return { ...this.#repo };
  }

  async createComment(_repo: RepoRef, number: number, body: string): Promise<WriteReceipt> {
    this.#received.push({ kind: WriteKind.Comment, number, body });

    const comments = this.#comments.get(number) ?? [];
    const id = Date.now();

    comments.push({ id, author: "mittens[bot]", body, createdAt: new Date().toISOString() });
    this.#comments.set(number, comments);

    return this.#record({ kind: WriteKind.Comment, number, url: null });
  }

  async closePullRequest(_repo: RepoRef, number: number): Promise<WriteReceipt> {
    this.#received.push({ kind: WriteKind.ClosePullRequest, number });

    const pull = this.#findPull(number);
    pull.state = "closed";

    return this.#record({ kind: WriteKind.ClosePullRequest, number, url: pull.url });
  }

  async closeIssue(_repo: RepoRef, number: number): Promise<WriteReceipt> {
    this.#received.push({ kind: WriteKind.CloseIssue, number });

    const issue = this.#issues.find((candidate) => candidate.number === number);

    if (!issue) {
      throw new Error(`Issue #${number} not found in fixtures`);
    }

    issue.state = "closed";

    return this.#record({ kind: WriteKind.CloseIssue, number, url: issue.url });
  }

  #findPull(number: number): PullRequest {
    const pull = this.#pulls.find((candidate) => candidate.number === number);

    if (!pull) {
      throw new Error(`Pull request #${number} not found in fixtures`);
    }

    return pull;
  }

  #record(receipt: WriteReceipt): WriteReceipt {
    this.#writes.push(receipt);
    return receipt;
  }
}

function matchesState(actual: ItemState, wanted: IssueState): boolean {
  if (wanted === IssueState.All) {
    return true;
  }

  return actual === wanted;
}
