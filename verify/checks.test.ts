/**
 * Unit tests of the host-side checks. Node's built-in test runner only.
 *
 * Usage: node --test verify/checks.test.ts
 *
 * Each test builds a small repository in a temporary folder, so no test reads
 * or writes the real gold set, manifest or ledger.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, test } from "node:test";

import { findUncovered } from "./coverage.ts";
import { ExitCode } from "./exit-codes.ts";
import { Stage, lintCase, loadCases } from "./lint-case.ts";
import { FILE_PREFIX, Kind, ROOT, readCriteria } from "./lint-criteria.ts";
import { FENCED_DIRS, MANIFEST_PATH, checkManifest } from "./manifest.ts";
import type { Outcome } from "./report.ts";
import { canonical, diffLines, normaliseExact, truncate, MAX_RESULT_CHARS } from "./normalise.ts";
import { run, verify } from "./run.ts";
import { NOT_BUILT } from "./runner/adapter.ts";
import { CaseStatus, runCasesInWorkerd } from "./runner/spawn.ts";
import type { CaseRunner } from "./runner/spawn.ts";

const ROWS_PER_FILE = 3;
const FIXTURE_MUST_COUNT = 15;
const OLD_ID_COUNT = 10;
const ID_DIGITS = 3;
const EXAMPLE_CASE = path.join(ROOT, "docs", "example-case.json");
const HELD_OUT_MANIFEST = "MANIFEST.sha256";

const TEMP_PREFIX = path.join(tmpdir(), "mittens-verify-");

type TestCase = Record<string, unknown>;

let root = "";

function pad(number: number): string {
  return String(number).padStart(ID_DIGITS, "0");
}

/** Example: | SBX-001 | MUST | The part MUST hold (was KCM-001). | contract: one case | */
function mustRow(id: string, cite = ""): string {
  return `| ${id} | MUST | The part MUST hold${cite}. | contract: one case |`;
}

/** Writes five valid files, 15 MUST rows, citing KCM-001..KCM-010 once each. */
function writeCriteria(directory: string, extraRow = ""): void {
  mkdirSync(directory, { recursive: true });
  let oldNumber = 0;

  for (const [fileName, prefix] of Object.entries(FILE_PREFIX)) {
    const rows: string[] = [];

    for (let number = 1; number <= ROWS_PER_FILE; number += 1) {
      oldNumber += 1;
      const cite = oldNumber <= OLD_ID_COUNT ? ` (was KCM-${pad(oldNumber)})` : "";
      rows.push(mustRow(`${prefix}-${pad(number)}`, cite));
    }

    if (fileName === "sandbox.md" && extraRow !== "") {
      rows.push(extraRow);
    }

    writeFileSync(path.join(directory, fileName), `${rows.join("\n")}\n`);
  }
}

/** Lists every file under a folder, at any depth. Example: "programs/a.js". */
function listFiles(directory: string, prefix = ""): string[] {
  const files: string[] = [];

  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const relative = `${prefix}${entry.name}`;

    if (entry.isDirectory()) {
      files.push(...listFiles(path.join(directory, entry.name), `${relative}/`));
      continue;
    }

    files.push(relative);
  }

  return files.sort();
}

function digestLine(base: string, relative: string): string {
  const digest = createHash("sha256").update(readFileSync(path.join(base, relative))).digest("hex");

  return `${digest}  ${relative}`;
}

/** Does what the human does: hashes every fenced file into the manifest. */
function sign(): void {
  const lines = FENCED_DIRS.flatMap((fencedDir) =>
    listFiles(path.join(root, fencedDir)).map((name) => digestLine(root, `${fencedDir}/${name}`)),
  );

  writeFileSync(path.join(root, MANIFEST_PATH), `${lines.join("\n")}\n`);
}

/** Signs a cases folder outside gold/cases, as the human does for the held-out set. */
function signFolder(directory: string): void {
  const lines = listFiles(directory)
    .filter((name) => name !== HELD_OUT_MANIFEST)
    .map((name) => digestLine(directory, name));

  writeFileSync(path.join(directory, HELD_OUT_MANIFEST), `${lines.join("\n")}\n`);
}

function makeCase(id: string, covers: string[], kind: Kind = Kind.CONTRACT): TestCase {
  return {
    id,
    covers,
    kind,
    verified: "by hand, 2026-11-23",
    input: { call: "facade.spec" },
    expected: "text",
  };
}

function addCase(goldCase: TestCase, fileName = `${String(goldCase.id)}.json`): void {
  writeFileSync(path.join(root, "gold", "cases", fileName), JSON.stringify(goldCase));
}

function readExample(): { input: TestCase } & TestCase {
  return JSON.parse(readFileSync(EXAMPLE_CASE, "utf8"));
}

// Every test gets a fresh repository: fenced folders, one verifier file and
// valid criteria. It is removed after the test.
beforeEach(() => {
  root = mkdtempSync(TEMP_PREFIX);

  for (const fencedDir of FENCED_DIRS) {
    mkdirSync(path.join(root, fencedDir), { recursive: true });
  }

  writeFileSync(path.join(root, "verify", "run.ts"), "export {};\n");
  writeCriteria(path.join(root, "criteria"));
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("criteria lint", () => {
  function errorsWith(extraRow: string): string[] {
    writeCriteria(path.join(root, "criteria"), extraRow);

    return readCriteria(path.join(root, "criteria")).errors;
  }

  test("real criteria are valid", () => {
    assert.deepEqual(readCriteria(path.join(ROOT, "criteria")).errors, []);
  });

  test("valid files pass", () => {
    assert.deepEqual(errorsWith(""), []);
  });

  test("repeated id", () => {
    assert.deepEqual(errorsWith(mustRow("SBX-001")), ["SBX-001: appears 2 times"]);
  });

  test("unknown level", () => {
    const errors = errorsWith("| SBX-009 | MAY | The part MAY hold. | exact: one case |");

    assert.deepEqual(errors, ["SBX-009: level 'MAY' is not MUST or SHOULD"]);
  });

  test("missing kind", () => {
    const errors = errorsWith("| SBX-009 | MUST | The part MUST hold. | one case |");

    assert.match(errors[0] ?? "", /^SBX-009: row is not/);
  });

  test("wrong prefix", () => {
    const errors = errorsWith("| ZZZ-001 | MUST | The part MUST hold. | exact: one case |");

    assert.deepEqual(errors, ["ZZZ-001: wrong prefix for sandbox.md, expected SBX"]);
  });

  test("level word missing", () => {
    const errors = errorsWith("| SBX-009 | MUST | The part holds. | exact: one case |");

    assert.deepEqual(errors, ["SBX-009: requirement does not contain the word MUST"]);
  });

  test("invariant cannot prove a MUST", () => {
    const errors = errorsWith("| SBX-009 | MUST | The part MUST hold. | invariant: 5 runs |");

    assert.deepEqual(errors, ["SBX-009: an invariant cannot prove a MUST"]);
  });

  test("row with other spacing is an error, not skipped", () => {
    const errors = errorsWith("|  SBX-009 | MUST | The part MUST hold. | contract: one case |");

    assert.deepEqual(errors, ["SBX-009: is cited but has no valid row"]);
  });

  test("missing file and old id", () => {
    rmSync(path.join(root, "criteria", "sandbox.md"));
    const { errors } = readCriteria(path.join(root, "criteria"));

    assert.ok(errors.includes("sandbox.md: file is missing"));
    assert.ok(errors.includes("12 criteria, expected 15 to 25"));
    assert.ok(errors.includes("KCM-001: not carried forward"));
  });
});

describe("case lint", () => {
  test("example case is valid", () => {
    assert.equal(lintCase(readExample(), Stage.SIGNED), null);
  });

  test("signed needs verified", () => {
    const goldCase = makeCase("G-001", ["SBX-001"]);
    delete goldCase.verified;

    assert.equal(lintCase(goldCase, Stage.DRAFT), null);
    assert.equal(lintCase(goldCase, Stage.SIGNED), "verified is missing");
  });

  test("first error per field", () => {
    const badCases: [TestCase, string][] = [
      [{ id: "G-1" }, "id must look like G-012"],
      [{ covers: [] }, "covers must be a non-empty list"],
      [{ covers: ["sbx-1"] }, "covers entry 'sbx-1' is not a criterion ID"],
      [{ kind: "snapshot" }, "kind 'snapshot' is not known"],
      [{ verified: "yes" }, "verified must look like 'by hand, 2026-11-22' or 'by agent, 2026-11-22'"],
      [{ input: {} }, "input.call must be a non-empty string"],
      [{ extra: 1 }, "unknown key 'extra'"],
    ];

    for (const [change, expected] of badCases) {
      const goldCase = { ...makeCase("G-001", ["SBX-001"]), ...change };

      assert.equal(lintCase(goldCase, Stage.SIGNED), expected);
    }
  });

  test("adversarial shape", () => {
    const goldCase = makeCase("G-001", ["SBX-001"], Kind.ADVERSARIAL);
    goldCase.input = { program: "fixtures/programs/exfil-fetch.js", options: { tickBudget: 10000 } };
    goldCase.expected = { error: "no internet", result: null };

    assert.equal(lintCase(goldCase, Stage.SIGNED), null);

    goldCase.expected = { error: "no internet" };

    assert.equal(lintCase(goldCase, Stage.SIGNED), "expected must hold exactly 'error' and 'result'");
  });

  test("invariant shape", () => {
    const goldCase = makeCase("G-001", ["APP-006"], Kind.INVARIANT);
    goldCase.expected = ["parses"];

    assert.equal(lintCase(goldCase, Stage.SIGNED), "runs must be a positive integer");

    goldCase.runs = 5;

    assert.equal(lintCase(goldCase, Stage.SIGNED), null);
  });

  test("exact shape", () => {
    const goldCase = readExample();
    goldCase.input.approval = "maybe";

    assert.equal(lintCase(goldCase, Stage.SIGNED), "input.approval must be approve or reject");

    goldCase.input.model_script = [{ program: "x.js" }];

    assert.equal(lintCase(goldCase, Stage.SIGNED), "input.model_script[0] needs 'tool' or 'text'");
  });
});

describe("coverage", () => {
  function uncovered(): string[] {
    const { criteria } = readCriteria(path.join(root, "criteria"));
    const { cases } = loadCases(path.join(root, "gold", "cases"), Stage.SIGNED);

    return findUncovered(criteria, cases);
  }

  test("no cases means every MUST", () => {
    assert.equal(uncovered().length, FIXTURE_MUST_COUNT);
  });

  test("blocking case covers", () => {
    addCase(makeCase("G-001", ["SBX-001", "SBX-002"]));

    assert.equal(uncovered().length, FIXTURE_MUST_COUNT - 2);
    assert.ok(!uncovered().includes("SBX-001"));
  });

  test("invariant case does not cover", () => {
    addCase({ ...makeCase("G-001", ["SBX-001"], Kind.INVARIANT), runs: 5, expected: ["parses"] });

    assert.ok(uncovered().includes("SBX-001"));
  });

  test("case of another kind does not cover", () => {
    const goldCase = makeCase("G-001", ["SBX-001"], Kind.ADVERSARIAL);
    goldCase.input = { program: "fixtures/programs/exfil-fetch.js" };
    goldCase.expected = { error: "no internet", result: null };
    addCase(goldCase);

    assert.ok(uncovered().includes("SBX-001"));
  });

  test("duplicate case id", () => {
    addCase(makeCase("G-001", ["SBX-001"]));
    addCase(makeCase("G-001", ["SBX-002"]), "copy.json");

    const { errors } = loadCases(path.join(root, "gold", "cases"), Stage.SIGNED);

    assert.deepEqual(errors, ["copy.json: id G-001 is used by another case"]);
  });
});

describe("manifest", () => {
  test("missing manifest is broken", () => {
    assert.deepEqual(checkManifest(root), ["gold/MANIFEST.sha256 (missing)"]);
  });

  test("signed repo is intact", () => {
    addCase(makeCase("G-001", ["SBX-001"]));
    sign();

    assert.deepEqual(checkManifest(root), []);
  });

  test("changed, added, deleted", () => {
    addCase(makeCase("G-001", ["SBX-001"]));
    writeFileSync(path.join(root, "loop", "loop.sh"), "true\n");
    sign();

    writeFileSync(path.join(root, "verify", "run.ts"), "export {};  \n");
    rmSync(path.join(root, "loop", "loop.sh"));
    addCase(makeCase("G-002", ["SBX-002"]));

    assert.deepEqual(checkManifest(root), [
      "gold/cases/G-002.json (not in manifest)",
      "loop/loop.sh (deleted)",
      "verify/run.ts (changed)",
    ]);
  });
});

describe("manifest scope", () => {
  test("criteria edit after signing breaks the fence", () => {
    sign();
    writeCriteria(path.join(root, "criteria"), mustRow("SBX-009"));

    assert.deepEqual(checkManifest(root), ["criteria/sandbox.md (changed)"]);
  });

  test("nested fixture edit after signing breaks the fence", () => {
    mkdirSync(path.join(root, "fixtures", "programs"), { recursive: true });
    writeFileSync(path.join(root, "fixtures", "programs", "stale.js"), "return 1;\n");
    sign();

    writeFileSync(path.join(root, "fixtures", "programs", "stale.js"), "return 2;\n");

    assert.deepEqual(checkManifest(root), ["fixtures/programs/stale.js (changed)"]);
  });

  test("symlink in a fenced folder breaks the fence", () => {
    sign();
    symlinkSync("/nonexistent", path.join(root, "loop", "dangling"));

    assert.deepEqual(checkManifest(root), ["loop/dangling (symlink)"]);
  });
});

describe("cases outside gold/cases", () => {
  let heldOut = "";

  beforeEach(() => {
    heldOut = path.join(root, "elsewhere");
    mkdirSync(heldOut);
    writeFileSync(path.join(heldOut, "G-001.json"), JSON.stringify(makeCase("G-001", ["SBX-001"])));
    sign();
  });

  test("unsigned folder breaks the fence", () => {
    const result = verify(root, heldOut);

    assert.equal(result.exitCode, ExitCode.FENCE_BROKEN);
    assert.deepEqual(result.fence, ["elsewhere/MANIFEST.sha256 (missing)"]);
  });

  test("signed folder passes the fence", () => {
    signFolder(heldOut);

    assert.equal(verify(root, heldOut).exitCode, ExitCode.UNCOVERED);
  });

  test("case changed after signing breaks the fence", () => {
    signFolder(heldOut);
    writeFileSync(path.join(heldOut, "G-001.json"), JSON.stringify(makeCase("G-001", ["SBX-002"])));

    assert.deepEqual(verify(root, heldOut).fence, ["elsewhere/G-001.json (changed)"]);
  });
});

describe("verifier crash", () => {
  test("is its own exit code and reaches last-run.json", () => {
    // A folder where a criteria file should be: reading it throws EISDIR.
    rmSync(path.join(root, "criteria", "sandbox.md"));
    mkdirSync(path.join(root, "criteria", "sandbox.md"));
    sign();

    const result = run(root, path.join(root, "gold", "cases"));
    const lastRun = JSON.parse(readFileSync(path.join(root, "ledger", "last-run.json"), "utf8"));

    assert.equal(result.exitCode, ExitCode.VERIFIER_ERROR);
    assert.equal(lastRun.exit_code, ExitCode.VERIFIER_ERROR);
    assert.match(lastRun.internal_error, /EISDIR/);
  });
});

describe("run", () => {
  function outcome(): Outcome {
    return verify(root, path.join(root, "gold", "cases"));
  }

  function coverAll(): void {
    const { criteria } = readCriteria(path.join(root, "criteria"));

    addCase(makeCase("G-001", criteria.map((criterion) => criterion.id)));
  }

  test("fence is checked first", () => {
    assert.equal(outcome().exitCode, ExitCode.FENCE_BROKEN);
  });

  test("no cases is uncovered", () => {
    sign();
    const result = outcome();

    assert.equal(result.exitCode, ExitCode.UNCOVERED);
    assert.equal(result.uncovered.length, FIXTURE_MUST_COUNT);
  });

  test("unknown covers goes to the human", () => {
    addCase(makeCase("G-001", ["SBX-099"]));
    sign();
    const result = outcome();

    assert.equal(result.exitCode, ExitCode.UNCOVERED);
    assert.deepEqual(result.goldSetErrors, ["G-001: covers SBX-099, not in criteria/"]);
  });

  /** A runner that gives every case the same status, without workerd. */
  function runnerWith(status: CaseStatus): CaseRunner {
    return (_root, _casesDir, cases) =>
      cases.map((goldCase) => ({ id: goldCase.id, status, durationMs: 1, detail: "" }));
  }

  function outcomeWith(status: CaseStatus): Outcome {
    return verify(root, path.join(root, "gold", "cases"), runnerWith(status));
  }

  test("a failing case is red and named", () => {
    coverAll();
    sign();
    const result = outcomeWith(CaseStatus.FAIL);

    assert.equal(result.exitCode, ExitCode.RED);
    assert.deepEqual(result.failing, ["G-001"]);
  });

  test("every case passing is green", () => {
    coverAll();
    sign();
    const result = outcomeWith(CaseStatus.PASS);

    assert.equal(result.exitCode, ExitCode.GREEN);
    assert.equal(result.passed, 1);
  });

  test("a runner that throws is a verifier crash", () => {
    coverAll();
    sign();
    const broken: CaseRunner = () => {
      throw new Error("case runner wrote no report");
    };

    assert.equal(run(root, path.join(root, "gold", "cases"), broken).exitCode, ExitCode.VERIFIER_ERROR);
  });
});

describe("normalise", () => {
  const RANGE = { min: 0, max: 5000 };

  test("a number inside the range matches the range", () => {
    const { expected, actual } = normaliseExact(
      { ledger: { isolate_start_ms: RANGE, facade_calls: 6 } },
      { ledger: { facade_calls: 6, isolate_start_ms: 412 } },
    );

    assert.equal(canonical(expected), canonical(actual));
  });

  test("a number outside the range stays visible", () => {
    const { expected, actual } = normaliseExact(
      { ledger: { isolate_start_ms: RANGE } },
      { ledger: { isolate_start_ms: 5001 } },
    );

    assert.notEqual(canonical(expected), canonical(actual));
  });

  test("timestamps and row ids become placeholders", () => {
    const { actual } = normaliseExact(
      { ledger: { id: 1, created_at: "a" } },
      { ledger: { id: 7, created_at: "2026-11-25T00:00:00Z" } },
    );

    assert.deepEqual(actual, { ledger: { id: "<id>", created_at: "<ts>" } });
  });

  test("key order never matters, values do", () => {
    assert.equal(canonical({ b: 1, a: [{ d: 1, c: 2 }] }), canonical({ a: [{ c: 2, d: 1 }], b: 1 }));
    assert.notEqual(canonical({ a: "x " }), canonical({ a: "x" }));
  });

  test("long results are truncated like the ledger", () => {
    assert.equal(truncate("x".repeat(MAX_RESULT_CHARS + 5)).length, MAX_RESULT_CHARS + 3);
  });

  test("diff marks both sides and is capped", () => {
    assert.deepEqual(diffLines("a\nb\nc", "a\nx\nc"), ["  a", "- b", "+ x", "  c"]);

    const long = diffLines("", Array.from({ length: 80 }, (_, i) => String(i)).join("\n"), 10);
    assert.equal(long.length, 11);
  });
});

describe("case runner inside workerd", () => {
  test("runs a signed case and reports the adapter's answer", () => {
    // The example case names a fixture and a program; give it both.
    const goldCase = JSON.parse(readFileSync(EXAMPLE_CASE, "utf8")) as TestCase;
    const casesDir = path.join(root, "gold", "cases");
    mkdirSync(path.join(root, "fixtures", "programs"), { recursive: true });
    writeFileSync(path.join(root, "fixtures", "repo-small.json"), "{}");
    writeFileSync(path.join(root, "fixtures", "programs", "stale-prs.js"), "async () => null");
    writeFileSync(path.join(casesDir, "G-012.json"), JSON.stringify(goldCase));

    const { cases } = loadCases(casesDir, Stage.SIGNED);
    const [result] = runCasesInWorkerd(root, casesDir, cases);

    // Until the packages exist the adapter refuses every case, by name.
    assert.equal(result?.id, "G-012");
    assert.equal(result?.status, CaseStatus.FAIL);
    assert.match(result?.detail ?? "", new RegExp(NOT_BUILT.slice(0, 40)));
  });
});
