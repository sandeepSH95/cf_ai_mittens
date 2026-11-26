/**
 * The typed facade the model is told about. This part of the prototype's
 * facade suite needs no binding and no driver, so it lives with the package.
 */
import { describe, expect, it } from "vitest";
import { FACADE_METHODS, githubReads, type GitHubDriver } from "../src/index";

// The spec needs no driver call, so an empty driver is enough here.
const spec = githubReads({} as GitHubDriver, { owner: "octocat", name: "hello-world" }).spec;

describe("the spec the model reads", () => {
  it("names every facade method", () => {
    for (const method of FACADE_METHODS) {
      expect(spec()).toContain(`${method}(`);
    }
  });
});
