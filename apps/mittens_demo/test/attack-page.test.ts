/**
 * The attack page's API: the same eight attacks against two executors.
 *
 *   /api/attacks/mittens --> 0 breached
 *   /api/attacks/naive   --> 1 breached: "env inspection" reads the token from env
 *
 * The naive executor differs from the real sandbox in one line (the token is
 * in the isolate's env), so the difference in the two reports proves what
 * that line costs.
 */
import { exports } from "cloudflare:workers";
import { ATTACK_PROGRAMS, AttackOutcome, CANARY_GITHUB_TOKEN } from "mittens_attack";
import { describe, expect, it } from "vitest";
import type { AttackRun } from "../src/services/attack-run";

const ORIGIN = "http://mittens.test";
const HTTP_OK = 200;
const HTTP_NOT_FOUND = 404;
const LEAKING_ATTACK = "env inspection";
const SECRET_READ_DETAIL = "the canary is in what the executor reported: the program could read the secret";

type WorkerFetcher = { fetch(request: Request): Promise<Response> };

const worker = exports.default as unknown as WorkerFetcher;

async function attack(target: string): Promise<AttackRun> {
  const response = await worker.fetch(new Request(`${ORIGIN}/api/attacks/${target}`));

  expect(response.status).toBe(HTTP_OK);

  return response.json();
}

describe("the attack page's API", () => {
  it("holds all eight attacks in the real sandbox", async () => {
    const run = await attack("mittens");

    expect(run.breached).toBe(0);
    expect(run.cases.map((row) => row.name)).toEqual(ATTACK_PROGRAMS.map((program) => program.name));
    expect(run.cases.every((row) => row.outcome === AttackOutcome.Held)).toBe(true);
  });

  it("shows the token leak of the naive executor, and only that", async () => {
    const run = await attack("naive");
    const breached = run.cases.filter((row) => row.outcome === AttackOutcome.Breached).map((row) => row.name);

    expect(breached).toEqual([LEAKING_ATTACK]);
    expect(run.breached).toBe(1);
  });

  it("says in the breach's detail that the program could read the secret", async () => {
    const run = await attack("naive");
    const leak = run.cases.find((row) => row.name === LEAKING_ATTACK);

    expect(leak?.detail).toBe(SECRET_READ_DETAIL);
  });

  it("sends each attack's program and criterion, and never the canary", async () => {
    for (const target of ["mittens", "naive"]) {
      const run = await attack(target);

      expect(run.cases.every((row) => row.code.length > 0 && row.criterion.length > 0), target).toBe(true);
      expect(JSON.stringify(run), target).not.toContain(CANARY_GITHUB_TOKEN);
    }
  });

  it("answers an unknown target and a write method with 404", async () => {
    const unknown = await worker.fetch(new Request(`${ORIGIN}/api/attacks/other`));
    const post = await worker.fetch(new Request(`${ORIGIN}/api/attacks/naive`, { method: "POST" }));

    expect(unknown.status).toBe(HTTP_NOT_FOUND);
    expect(post.status).toBe(HTTP_NOT_FOUND);
  });
});
