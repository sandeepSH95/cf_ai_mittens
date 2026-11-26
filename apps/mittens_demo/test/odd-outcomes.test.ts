/**
 * Two program outcomes that the first build handled wrongly. Both came from a code review.
 *
 *   throw new Error("")       --> the run failed, so the model must be told that it failed
 *   return { big: 10n }       --> JSON cannot hold a BigInt, and the ledger must still record the run
 */
import { describe, expect, it } from "vitest";
import { runProgram, runRecorded, runThroughCodeTool } from "./support";

const EMPTY_ERROR_PROGRAM = `async () => { throw new Error(""); }`;
const BIGINT_PROGRAM = `async () => ({ big: 10n })`;

describe("a program that throws an error with no message", () => {
  it("is reported with an error text that is not empty", async () => {
    const run = await runProgram(EMPTY_ERROR_PROGRAM);

    expect(run.result).toBeNull();
    expect(run.error).toBeTruthy();
  });

  it("reaches the model as a failed tool call, not as a success with no result", async () => {
    await expect(runThroughCodeTool(EMPTY_ERROR_PROGRAM)).rejects.toThrow();
  });
});

describe("a program that returns a value JSON cannot hold", () => {
  it("is still recorded in the ledger", async () => {
    const { run, row } = await runRecorded(BIGINT_PROGRAM);

    expect(run.error).toBeNull();
    expect(row).not.toBeNull();
    expect(row?.resultJson).toContain("10");
  });
});
