/**
 * The typed facade the model is told about. This part of the prototype's
 * facade suite needs no binding and no driver, so it lives with the package.
 */
import { describe, expect, it } from "vitest";
import { FACADE_METHODS, spec } from "../src/index";

describe("the spec the model reads", () => {
  it("names every facade method", () => {
    for (const method of FACADE_METHODS) {
      expect(spec()).toContain(`${method}(`);
    }
  });
});
