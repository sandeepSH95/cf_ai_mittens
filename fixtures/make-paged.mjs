/**
 * Writes fixtures/repo-paged.json: 101 open pull requests, numbered 1 to 101.
 *
 * A list call that stops at 100 items returns 100, not 101, so the cut is
 * visible. Pull request N was last updated N days ago, so 71 of them
 * (31 to 101) are stale under the 30 day rule.
 *
 * Usage: node fixtures/make-paged.mjs
 */
import { writeFileSync } from "node:fs";
import path from "node:path";

const PULL_COUNT = 101;
const CREATED_BEFORE_UPDATE_DAYS = 5;
const NUMBER_WIDTH = 3;
const OUTPUT_NAME = "repo-paged.json";
const JSON_INDENT = 2;

// Example: 7 -> "007", so titles and authors sort and read easily.
function padded(number) {
  return String(number).padStart(NUMBER_WIDTH, "0");
}

function makePull(number) {
  return {
    number,
    title: `Paged pull request ${padded(number)}`,
    state: "open",
    author: `author-${padded(number)}`,
    createdDaysAgo: number + CREATED_BEFORE_UPDATE_DAYS,
    updatedDaysAgo: number,
    draft: false,
    labels: [],
    body: null,
  };
}

const fixture = {
  repo: {
    fullName: "mittens-fixtures/repo-paged",
    description: "Paged fixture: 101 open pull requests, no comments",
    openIssues: PULL_COUNT,
    defaultBranch: "main",
  },
  pullRequests: Array.from({ length: PULL_COUNT }, (_, index) => makePull(index + 1)),
  issues: [],
  comments: {},
};

const outputPath = path.join(import.meta.dirname, OUTPUT_NAME);
writeFileSync(outputPath, `${JSON.stringify(fixture, null, JSON_INDENT)}\n`, "utf8");
console.log(`wrote ${OUTPUT_NAME}: ${fixture.pullRequests.length} pull requests`);
