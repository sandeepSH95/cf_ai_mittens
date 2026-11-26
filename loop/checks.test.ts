/**
 * Tests of the loop scripts and the hooks. Run: npm run test:verify
 * No test starts a builder or the verifier: they check the rules only.
 */

import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

import { Mode, verdict } from "../.claude/hooks/guard.ts";
import { regressions } from "../.claude/hooks/stop.ts";
import { Stop, capReached, nextPass, parseCaps } from "./loop.ts";
import { LEDGER_PATH, recordPass } from "./record.ts";

const ROOT = "/repo";
const CAPS = { MAX_PASSES: 12, PLATEAU: 3, MAX_MINUTES: 120, PASS_MINUTES: 30 };
const FRESH = { passesDone: 0, stalled: 0, minutesUsed: 0 };

function bash(command: string, mode: Mode = Mode.BUILDER): string | null {
  return verdict({ tool_name: "Bash", tool_input: { command }, cwd: ROOT }, mode, ROOT);
}

function fileTool(tool: string, filePath: string, mode: Mode = Mode.BUILDER): string | null {
  return verdict({ tool_name: tool, tool_input: { file_path: filePath }, cwd: ROOT }, mode, ROOT);
}

describe("guard, builder pass", () => {
  test("refuses an edit of a gold case", () => {
    assert.equal(fileTool("Edit", "/repo/gold/cases/G-001.json"), "fenced path: gold/cases/G-001.json. Stop and report.");
  });

  test("refuses a write to every fenced place", () => {
    for (const fenced of ["criteria/gate.md", "fixtures/repo-small.json", "verify/run.ts", "loop/caps.env", "gold/MANIFEST.sha256", ".claude/settings.json", ".claude/hooks/guard.ts"]) {
      assert.match(String(fileTool("Write", fenced)), /^fenced path: /, fenced);
    }
  });

  test("allows a write to the packages, the app and the drafts", () => {
    for (const open of ["packages/mittens_gate/src/index.ts", "apps/mittens_demo/src/server.ts", "gold/drafts/G-050.json", "HANDOFF.md"]) {
      assert.equal(fileTool("Write", open), null, open);
    }
  });

  test("allows a read of a fenced file", () => {
    assert.equal(fileTool("Read", "/repo/criteria/gate.md"), null);
    assert.equal(bash("cat criteria/gate.md | head -5"), null);
    assert.equal(bash("sed -n 1,20p verify/runner/CONTRACT.md"), null);
    assert.equal(bash("git diff verify/"), null);
  });

  test("allows the verifier and the linter", () => {
    assert.equal(bash("sh verify/run.sh"), null);
    assert.equal(bash("sh verify/run.sh > /tmp/out.txt 2>&1; tail -5 /tmp/out.txt"), null);
    assert.equal(bash("node verify/lint-case.ts gold/drafts/G-050.json"), null);
  });

  test("refuses a shell write to a fenced path", () => {
    const writes = [
      "rm gold/cases/G-001.json",
      "echo x > verify/run.ts",
      "echo x >> ./criteria/gate.md",
      "sed -i '' s/a/b/ loop/caps.env",
      "cp /tmp/x fixtures/repo-small.json",
      "cd verify && rm run.ts",
      "node verify/manifest.ts --print > gold/MANIFEST.sha256",
      "git checkout HEAD~1 -- verify/run.ts",
      "find gold/cases -name '*.json' -delete",
      "tee /repo/loop/PROMPT.md",
    ];

    for (const command of writes) {
      assert.match(String(bash(command)), /^fenced path: /, command);
    }
  });

  test("refuses every access to the held-out set", () => {
    assert.equal(bash("ls ../mittens_holdout"), "fenced path: mittens_holdout. Stop and report.");
    assert.equal(bash("GOLD_DIR=../mittens_holdout sh verify/run.sh"), "fenced path: mittens_holdout. Stop and report.");
    assert.equal(fileTool("Read", "/work/mittens_holdout/G-901.json"), "fenced path: mittens_holdout. Stop and report.");
  });
});

describe("guard, every session", () => {
  test("refuses deploy, login, secrets and push", () => {
    for (const mode of [Mode.BUILDER, Mode.INTERACTIVE]) {
      assert.equal(bash("npx wrangler deploy", mode), "deploy and secrets are human steps");
      assert.equal(bash("wrangler secret put GITHUB_TOKEN", mode), "deploy and secrets are human steps");
      assert.equal(bash("cd apps/mittens_demo && wrangler login", mode), "deploy and secrets are human steps");
      assert.equal(bash("git push origin master", mode), "git push is a human step");
    }
  });

  test("allows wrangler dev and wrangler types", () => {
    assert.equal(bash("npx wrangler dev --local"), null);
    assert.equal(bash("npx wrangler types"), null);
  });

  test("leaves the fence to the human in an interactive session", () => {
    assert.equal(fileTool("Edit", "verify/run.ts", Mode.INTERACTIVE), null);
    assert.equal(bash("rm gold/cases/G-001.json", Mode.INTERACTIVE), null);
  });
});

describe("caps", () => {
  test("parses the four numbers and skips comments", () => {
    const text = "# caps\nMAX_PASSES=12\n\nPLATEAU=3\nMAX_MINUTES=120\nPASS_MINUTES=30\n";

    assert.deepEqual({ ...parseCaps(text) }, CAPS);
  });

  test("names a missing cap", () => {
    assert.throws(() => parseCaps("MAX_PASSES=12\n"), /PLATEAU is missing/);
  });

  test("lets a fresh run start", () => {
    assert.equal(capReached(CAPS, FRESH), Stop.NONE);
  });

  test("stops at each cap", () => {
    assert.equal(capReached(CAPS, { ...FRESH, passesDone: 12 }), Stop.PASSES);
    assert.equal(capReached(CAPS, { ...FRESH, stalled: 3 }), Stop.PLATEAU);
    assert.equal(capReached(CAPS, { ...FRESH, minutesUsed: 120 }), Stop.MINUTES);
  });
});

describe("ledger", () => {
  test("numbers the first pass 1 and the next one after the last line", () => {
    assert.equal(nextPass(""), 1);
    assert.equal(nextPass('{"pass":0}\n{"pass":4}\n'), 5);
  });

  test("appends one line with the keys of HARN-003", () => {
    const root = mkdtempSync(path.join(tmpdir(), "mittens-loop-"));

    try {
      mkdirSync(path.join(root, "ledger"));
      writeFileSync(path.join(root, "ledger/last-run.json"), JSON.stringify({ passed: 2, failed: 1, failing: ["G-004"] }));

      recordPass(root, 0, 1);
      recordPass(root, 1, 1);

      const lines = readFileSync(path.join(root, LEDGER_PATH), "utf8").trimEnd().split("\n");

      assert.equal(lines.length, 2);
      assert.deepEqual(JSON.parse(String(lines[1])), { pass: 1, commit: "none", exit_code: 1, passed: 2, failed: 1, failing: ["G-004"] });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("stop hook", () => {
  test("names only the cases that passed at the start of the pass", () => {
    assert.deepEqual(regressions(["G-001", "G-002"], ["G-002", "G-025"]), ["G-025"]);
    assert.deepEqual(regressions(["G-001", "G-002"], ["G-002"]), []);
  });
});
