/**
 * Covers KCM-004 (the ledger records facade calls, round trips, isolate start and tokens per program run).
 */
import { describe, expect, it } from "vitest";
import { Ledger, ROUND_TRIPS_PER_PROGRAM } from "../src/services/ledger";
import { inAgent, runRecorded } from "./support";

const SEVEN_CALL_NUMBERS = [101, 102, 104, 105, 107];
const EXPECTED_FACADE_CALLS = 2 + SEVEN_CALL_NUMBERS.length;

/** One program, seven facade calls: getRepo, listPullRequests, then five listComments. */
const SEVEN_CALLS = `async () => {
  const repo = await github.getRepo();
  const open = await github.listPullRequests({ state: "open" });
  let comments = 0;
  for (const number of ${JSON.stringify(SEVEN_CALL_NUMBERS)}) {
    const list = await github.listComments({ number });
    comments += list.length;
  }
  return { repo: repo.fullName, open: open.length, comments };
}`;

describe("KCM-004 ledger", () => {
  it("one program making 7 facade calls -> facade_calls = 7, round_trips = 1", async () => {
    const { run, row } = await runRecorded(SEVEN_CALLS);

    expect(run.error).toBeNull();
    expect(run.facadeCalls).toBe(EXPECTED_FACADE_CALLS);

    expect(row).not.toBeNull();
    expect(row?.facadeCalls).toBe(EXPECTED_FACADE_CALLS);
    expect(row?.roundTrips).toBe(ROUND_TRIPS_PER_PROGRAM);
    expect(row?.program).toBe(SEVEN_CALLS);
    expect(row?.isolateStartMs).not.toBeNull();
    expect(row?.isolateStartMs).toBeGreaterThanOrEqual(0);
    expect(row?.durationMs).toBeGreaterThanOrEqual(row?.isolateStartMs ?? 0);
    expect(row?.tokensIn).toBeNull();
    expect(row?.tokensOut).toBeNull();
  });

  it("a program that makes no facade call has no isolate start time", async () => {
    const { row } = await runRecorded(`async () => 42`);

    expect(row?.facadeCalls).toBe(0);
    expect(row?.isolateStartMs).toBeNull();
    expect(row?.resultJson).toBe("42");
  });

  it("a failed run is recorded with its error", async () => {
    const { row } = await runRecorded(`async () => { throw new Error("boom"); }`);

    expect(row?.error).toBe("boom");
    expect(row?.resultJson).toBeNull();
  });

  it("attachUsage fills in tokens from the model step", async () => {
    const rows = await inAgent(async (state) => {
      const ledger = new Ledger(state.storage.sql);
      const row = ledger.recordRun({ code: "async () => 1", result: 1, error: null, logs: [], facadeCalls: 0, isolateStartMs: null, durationMs: 3 });
      ledger.attachUsage(row.id, { inputTokens: 120, outputTokens: 80 });
      return { before: row, after: ledger.get(row.id), count: ledger.list().length };
    });

    expect(rows.before.tokensIn).toBeNull();
    expect(rows.after?.tokensIn).toBe(120);
    expect(rows.after?.tokensOut).toBe(80);
    expect(rows.count).toBeGreaterThanOrEqual(1);
  });
});
