/**
 * The testing entry's runScriptedCase (contract, section 3): one turn of the
 * real CoderAgent with a scripted model and a stub over a fixture.
 */
import { describe, expect, it } from "vitest";
import fixture from "../src/fixtures/github.json";
import { runScriptedCase, type ScriptedCase } from "../src/testing";

const NOW = "2026-11-01T00:00:00.000Z";
const COMMENT = { kind: "comment", number: 101, body: "Please rebase." };

const PLAN_PROGRAM = `async () => {
  const open = await github.listPullRequests({ state: "open" });
  return { open: open.length, plan: { writes: [${JSON.stringify(COMMENT)}] } };
}`;

const BAD_READ_PROGRAM = `async () => {
  try {
    await github.getPullRequest({ number: "101" });
    return { rejected: false };
  } catch (error) {
    return { rejected: true };
  }
}`;

const TOO_MANY_PROGRAM = `async () => {
  const writes = [];
  for (let number = 1; number <= 26; number += 1) {
    writes.push({ kind: "close_issue", number });
  }
  return { plan: { writes } };
}`;

// One read skips the github object, one read uses it. The host must count both.
const RAW_HANDLE_PROGRAM = `async () => {
  const { env } = await import("cloudflare:workers");
  const direct = await env.GH.listPullRequests({ state: "open" });
  const wrapped = await github.listPullRequests({ state: "open" });
  return { direct: direct.length > 0 ? 1 : 0, wrapped: wrapped.length > 0 ? 1 : 0 };
}`;

const APPLY_FLOW = [{ tool: "apply_writes" }, { text: "done" }];

function scriptedCase(agentName: string, overrides: Partial<ScriptedCase>): ScriptedCase {
  return { agentName, fixture: JSON.stringify(fixture), now: NOW, userMessage: "Comment on 101", script: [], approval: null, ...overrides };
}

describe("runScriptedCase", () => {
  it("applies an approved plan through the stub and reports what the agent left behind", async () => {
    const script = [{ tool: "code", program: PLAN_PROGRAM }, ...APPLY_FLOW];
    const report = await runScriptedCase(scriptedCase("scripted-approve", { script, approval: "approve" }));

    expect(report.plan).toEqual({ writes: [COMMENT] });
    expect(report.approval_asked).toBe(true);
    expect(report.apply_outcome).toEqual({ applied: 1, failed: 0 });
    expect(report.stub_writes).toEqual([COMMENT]);
    expect(report.refusal).toBeNull();
    expect(report.model_received).toBe("json");
    expect(report.driver_calls).toBe(1);
    expect(report.ledger).toMatchObject({ facade_calls: 1, round_trips: 1, error: null });
    expect(report.agent_state.last_program).toBe(PLAN_PROGRAM);
    expect(report.agent_state.last_ledger).toEqual(report.ledger);
    expect(report.agent_state.runs).toBe(1);
  });

  it("writes nothing after a reject, and the model is told execution-denied", async () => {
    const script = [{ tool: "code", program: PLAN_PROGRAM }, ...APPLY_FLOW];
    const report = await runScriptedCase(scriptedCase("scripted-reject", { script, approval: "reject" }));

    expect(report.apply_outcome).toBeNull();
    expect(report.stub_writes).toEqual([]);
    expect(report.model_received).toBe("execution-denied");
  });

  it("reports the refusal of a plan that breaks a limit, and asks no approval for it", async () => {
    const script = [{ tool: "code", program: TOO_MANY_PROGRAM }, ...APPLY_FLOW];
    const report = await runScriptedCase(scriptedCase("scripted-refusal", { script, approval: "approve" }));

    expect(report.refusal).toBe("Plan refused: 26 writes, the limit is 25");
    expect(report.approval_asked).toBe(false);
    expect(report.apply_outcome).toBeNull();
    expect(report.stub_writes).toEqual([]);
  });

  it("counts a read through the raw gate handle in the ledger", async () => {
    const report = await runScriptedCase(scriptedCase("scripted-raw-handle", { script: [{ tool: "code", program: RAW_HANDLE_PROGRAM }, { text: "done" }] }));

    expect(report.program_result).toEqual({ direct: 1, wrapped: 1 });
    expect(report.ledger).toMatchObject({ facade_calls: 2, error: null });
    expect(report.ledger?.isolate_start_ms).not.toBeNull();
  });

  it("counts no driver call for a read the gate refused", async () => {
    const script = [{ tool: "code", program: BAD_READ_PROGRAM }, { text: "done" }];
    const report = await runScriptedCase(scriptedCase("scripted-bad-read", { script }));

    expect(report.program_result).toEqual({ rejected: true });
    expect(report.driver_calls).toBe(0);
    expect(report.ledger?.facade_calls).toBe(1);
  });

  it("stops a script that never ends at the step limit", async () => {
    const script = [{ tool: "code", program: BAD_READ_PROGRAM }];
    const report = await runScriptedCase(scriptedCase("scripted-endless", { script }));

    expect(report.agent_state.runs).toBe(6);
  });

  it("reports no program when no message was sent", async () => {
    const report = await runScriptedCase(scriptedCase("scripted-silent", { userMessage: null }));

    expect(report.program_result).toBeNull();
    expect(report.ledger).toBeNull();
    expect(report.agent_state).toEqual({ last_program: null, last_ledger: null, runs: 0 });
  });
});
