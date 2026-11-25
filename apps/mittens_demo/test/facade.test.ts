/**
 * Covers KCM-006 (GitHub driver behind an interface with a fixture stub) and the
 * typed facade the model is told about, including the fixed example program.
 */
import { EXAMPLE_PROGRAM, Facade } from "mittens_gate";
import { describe, expect, it } from "vitest";
import { createGitHubDriver, GitHubDriverKind, IssueState, parseRepoRef } from "../src/drivers/github";
import { StubGitHubDriver } from "../src/drivers/github-stub";
import { runProgram, runThroughCodeTool } from "./support";

const REPO = parseRepoRef("octocat/hello-world");
const DAY_MS = 24 * 60 * 60 * 1000;

/** Fixture facts (src/fixtures/github.json). */
const OPEN_PULLS = 8;
const CLOSED_PULLS = 1;
const OPEN_ISSUES = 2;
const COMMENTS_ON_104 = 3;
const PULL_101_AGE_DAYS = 95;
const STALE_NON_DRAFT_PULLS = [101, 102, 104, 105, 106];
const EXAMPLE_FACADE_CALLS = 1 + STALE_NON_DRAFT_PULLS.length;

function facade(): Facade {
  return new Facade(new StubGitHubDriver(), REPO);
}

describe("KCM-006 driver selection", () => {
  it("GITHUB_DRIVER=stub needs no token", () => {
    expect(createGitHubDriver({ GITHUB_DRIVER: GitHubDriverKind.Stub }).kind).toBe(GitHubDriverKind.Stub);
    expect(createGitHubDriver({}).kind).toBe(GitHubDriverKind.Stub);
  });

  it("GITHUB_DRIVER=github without a token is refused", () => {
    expect(() => createGitHubDriver({ GITHUB_DRIVER: GitHubDriverKind.Api })).toThrow(/GITHUB_TOKEN/);
  });

  it("GITHUB_DRIVER=github with a token builds the real driver", () => {
    expect(createGitHubDriver({ GITHUB_DRIVER: GitHubDriverKind.Api, GITHUB_TOKEN: "ghp_x" }).kind).toBe(GitHubDriverKind.Api);
  });

  it("an unknown driver name is refused", () => {
    expect(() => createGitHubDriver({ GITHUB_DRIVER: "gitlab" })).toThrow(/Unknown GITHUB_DRIVER/);
  });
});

describe("KCM-006 facade over the stub driver", () => {
  it("lists pull requests by state, defaulting to open", async () => {
    expect(await facade().listPullRequests()).toHaveLength(OPEN_PULLS);
    expect(await facade().listPullRequests({ state: IssueState.Closed })).toHaveLength(CLOSED_PULLS);
    expect(await facade().listPullRequests({ state: IssueState.All })).toHaveLength(OPEN_PULLS + CLOSED_PULLS);
  });

  it("returns the documented shapes with stable relative dates", async () => {
    const pull = await facade().getPullRequest({ number: 101 });
    const ageDays = (Date.now() - Date.parse(pull.createdAt)) / DAY_MS;

    expect(pull).toMatchObject({ number: 101, state: "open", author: "alice", draft: false });
    expect(Math.round(ageDays)).toBe(PULL_101_AGE_DAYS);
    expect(pull.url).toBe("https://github.com/octocat/hello-world/pull/101");
  });

  it("lists issues and comments", async () => {
    expect(await facade().listIssues()).toHaveLength(OPEN_ISSUES);
    expect(await facade().listComments({ number: 104 })).toHaveLength(COMMENTS_ON_104);
    expect(await facade().listComments({ number: 999 })).toHaveLength(0);
    expect((await facade().getRepo()).fullName).toBe("octocat/hello-world");
  });

  it("rejects malformed input before it reaches the driver", async () => {
    await expect(facade().listComments({})).rejects.toThrow();
    await expect(facade().getPullRequest({ number: -1 })).rejects.toThrow();
    await expect(facade().listPullRequests({ state: "merged" })).rejects.toThrow();
  });

  it("the stub throws for unknown numbers", async () => {
    await expect(facade().getPullRequest({ number: 999 })).rejects.toThrow(/not found/);
  });
});

describe("the spec the model reads", () => {
  it("the example program runs against the facade and plans comments for stale pull requests", async () => {
    const run = await runProgram(EXAMPLE_PROGRAM);

    expect(run.error).toBeNull();
    expect(run.facadeCalls).toBe(EXAMPLE_FACADE_CALLS);

    const result = run.result as { plan: { writes: { kind: string; number: number }[] } };
    expect(result.plan.writes.map((write) => write.number)).toEqual(STALE_NON_DRAFT_PULLS);
    expect(result.plan.writes.every((write) => write.kind === "comment")).toBe(true);
  });

  it("the code tool (createCodeTool over the sandbox) runs the example program end to end", async () => {
    const output = (await runThroughCodeTool(EXAMPLE_PROGRAM)) as { result: { plan: { writes: unknown[] } } };

    expect(output.result.plan.writes).toHaveLength(STALE_NON_DRAFT_PULLS.length);
  });

  it("the code tool reports a failing program as a thrown error the model can read", async () => {
    await expect(runThroughCodeTool(`async () => { await fetch("https://example.com"); }`)).rejects.toThrow(/Code execution failed/);
  });
});
