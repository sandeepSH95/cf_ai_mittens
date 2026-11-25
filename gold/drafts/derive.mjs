/**
 * Re-derives the expected values of every exact gold draft from the fixtures.
 *
 *     fixtures/repo-*.json --> materialise(now) --> staleFlow() --> printed lines
 *
 * It repeats the logic of fixtures/programs/ and does not run them, so a
 * wrong value in a draft differs from this printout and VERIFICATION.md.
 * Usage: node gold/drafts/derive.mjs
 */
import { readFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");
const DAY_MS = 24 * 60 * 60 * 1000;
const STALE_DAYS = 30;
const AS_OF = "2026-11-01T00:00:00.000Z";
const MAX_WRITES = 25;
const MAX_COMMENT_LENGTH = 4000;
const NOBODY = "nobody";
const SEVEN_READ_NUMBERS = [101, 102, 104, 105, 106];
const LIST_CALLS = 1;
const LONG_LIST = 8;
const LIST_HEAD = 3;
const WITH_PLAN = true;
const NO_PLAN = false;

function loadFixture(name) {
  return JSON.parse(readFileSync(path.join(ROOT, "fixtures", `repo-${name}.json`), "utf8"));
}

// The stub stores "days ago". Example: 90 days before 2026-11-01 is 2026-08-03.
function daysBefore(now, days) {
  return new Date(Date.parse(now) - days * DAY_MS).toISOString();
}

function openPulls(fixture) {
  return fixture.pullRequests.filter((pull) => pull.state === "open");
}

// Stale: not a draft, and last updated more than 30 days before the as-of date.
function isStale(pull, now) {
  const ageDays = (Date.parse(AS_OF) - Date.parse(daysBefore(now, pull.updatedDaysAgo))) / DAY_MS;

  return !pull.draft && ageDays > STALE_DAYS;
}

function lastVoice(fixture, number) {
  const comments = fixture.comments[String(number)] ?? [];

  return comments.length > 0 ? comments[comments.length - 1].author : NOBODY;
}

// Example: 71 items print as the first 3 and "... (71 in all)".
function shown(items) {
  if (items.length === 0) {
    return "(none)";
  }

  if (items.length <= LONG_LIST) {
    return items.join("; ");
  }

  return `${items.slice(0, LIST_HEAD).join("; ")}; ... (${items.length} in all)`;
}

function staleFlow(fixtureName, now) {
  const fixture = loadFixture(fixtureName);
  const open = openPulls(fixture);
  const stale = open.filter((pull) => isStale(pull, now));

  return {
    summary: `${stale.length} of ${open.length} open pull requests are stale.`,
    stale: stale.map((pull) => `${pull.number} updated ${daysBefore(now, pull.updatedDaysAgo)}`),
    voices: stale.map((pull) => `${pull.number}: ${lastVoice(fixture, pull.number)}`),
    writes: stale.length,
  };
}

// A plan is refused as a whole. Example: 26 writes -> "refused (26 > 25)".
function verdict(writeCount, longestBody) {
  if (writeCount > MAX_WRITES) {
    return `refused (${writeCount} writes > ${MAX_WRITES})`;
  }

  if (longestBody > MAX_COMMENT_LENGTH) {
    return `refused (body ${longestBody} > ${MAX_COMMENT_LENGTH})`;
  }

  return `accepted, applied ${writeCount}, failed 0`;
}

function printStale(id, fixtureName, now, plans) {
  const flow = staleFlow(fixtureName, now);
  const facadeCalls = plans ? LIST_CALLS + flow.writes : LIST_CALLS;

  console.log(`${id} ${fixtureName} now ${now}`);
  console.log(`  summary: ${flow.summary}`);
  console.log(`  stale: ${shown(flow.stale)}`);
  console.log(`  facade_calls: ${facadeCalls}`);

  if (!plans) {
    console.log("  plan: none");
    return;
  }

  console.log(`  last comment by: ${shown(flow.voices)}`);
  console.log(`  plan: ${flow.writes} comment writes, ${verdict(flow.writes, 0)}`);
}

function printPlan(id, writeCount, bodyLength) {
  console.log(`${id} plan with ${writeCount} writes, longest body ${bodyLength}`);
  console.log(`  ${verdict(writeCount, bodyLength)}`);
}

function printSevenReads(id) {
  const fixture = loadFixture("small");
  const comments = SEVEN_READ_NUMBERS.reduce((sum, number) => sum + (fixture.comments[String(number)] ?? []).length, 0);
  const reads = 2 + SEVEN_READ_NUMBERS.length;

  console.log(`${id} seven-reads on small`);
  console.log(`  result: repo ${fixture.repo.fullName}, open ${openPulls(fixture).length}, comments ${comments}, reads ${reads}`);
  console.log(`  facade_calls: ${reads}`);
}

function printCount(id) {
  const numbers = openPulls(loadFixture("paged")).map((pull) => pull.number);

  console.log(`${id} count-prs on paged`);
  console.log(`  result: open ${numbers.length}, lowest ${Math.min(...numbers)}, highest ${Math.max(...numbers)}`);
  console.log("  facade_calls: 1");
}

printStale("G-028 (approve) and G-029 (reject)", "small", AS_OF, WITH_PLAN);
printPlan("G-030", 26, "Planned comment 26 of 26.".length);
printPlan("G-031", 1, 4001);
printPlan("G-032", 25, "Planned comment 25 of 25.".length);
console.log("G-033 read-bad-input: 1 facade call, 0 driver calls (the host refuses the input)");
printSevenReads("G-034");
console.log("G-035 no-reads: result { answer: 42 }, facade_calls 0, isolate_start_ms null");
printStale("G-036", "small", AS_OF, NO_PLAN);
printStale("G-037", "empty", AS_OF, NO_PLAN);
printCount("G-038");
