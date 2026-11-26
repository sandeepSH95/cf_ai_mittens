/**
 * Draws docs/ledger-chart.svg from ledger/iterations.jsonl.
 *
 *   ledger/iterations.jsonl --> one point per pass --> docs/ledger-chart.svg
 *
 * The chart is generated, never drawn by hand, so the README cannot show a
 * number the ledger does not hold. Usage: node tools/ledger-chart.mjs
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "..");
const LEDGER_FILE = path.join(ROOT, "ledger/iterations.jsonl");
const CHART_FILE = path.join(ROOT, "docs/ledger-chart.svg");

const WIDTH = 760;
const HEIGHT = 430;
const PLOT = { left: 56, right: 600, top: 128, bottom: 372 };
const Y_MAX = 50;
const Y_STEP = 10;

// One light surface with fixed inks: a README image cannot follow the reader's theme.
const SURFACE = "#fcfcfb";
const INK = "#0b0b0b";
const INK_SECONDARY = "#52514e";
const GRID = "#e4e3df";
const SERIES = "#2a78d6";
const REFERENCE = "#8a8983";

const FONT = "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
const MARKER_RADIUS = 5;

// A value label sits right of and below its point, clear of the line that rises to the next point.
const LABEL_SHIFT = { x: 9, y: 16 };

// What happened between two passes. Each note sits on the gap after `afterPass`.
const NOTES = [
  { afterPass: 3, lines: ["held-out run 1:", "9 of 12", "+2 cases"] },
  { afterPass: 4, lines: ["review 1:", "9 gaps", "+6 cases"] },
  { afterPass: 5, lines: ["review 2:", "+2 cases"] },
];

// The passes whose value is written next to the point. Not every point: the table has them all.
const LABELLED_PASSES = [0, 3, 6];

function readLedger() {
  return readFileSync(LEDGER_FILE, "utf8")
    .split("\n")
    .filter((line) => line.trim() !== "")
    .map((line) => JSON.parse(line))
    .map((row) => ({ pass: row.pass, passed: row.passed, total: row.passed + row.failed }));
}

function chart(rows) {
  const lastPass = rows.at(-1).pass;
  const x = (pass) => PLOT.left + ((PLOT.right - PLOT.left) * pass) / lastPass;
  const y = (cases) => PLOT.bottom - ((PLOT.bottom - PLOT.top) * cases) / Y_MAX;
  const first = rows[0];
  const last = rows.at(-1);

  const title = `The loop took the gold set from ${first.passed} to ${last.passed} passing cases in ${lastPass} passes`;
  const subtitle = "Passing gold cases after each pass. The verifier's exit code ended each run, not the builder.";

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" role="img" aria-label="${title}. ${subtitle}" font-family="${FONT}">`,
    `<rect width="${WIDTH}" height="${HEIGHT}" rx="12" fill="${SURFACE}" stroke="${GRID}"/>`,
    `<text x="24" y="38" font-size="17" font-weight="600" fill="${INK}">${title}</text>`,
    `<text x="24" y="60" font-size="12.5" fill="${INK_SECONDARY}">${subtitle}</text>`,
    grid(y),
    passAxis(rows, x),
    notes(x),
    totalLine(rows, x, y),
    passedLine(rows, x, y),
    endLabels(last, x, y),
    "</svg>",
  ].join("\n");
}

function grid(y) {
  const lines = [];

  for (let cases = 0; cases <= Y_MAX; cases += Y_STEP) {
    lines.push(`<line x1="${PLOT.left}" x2="${PLOT.right}" y1="${y(cases)}" y2="${y(cases)}" stroke="${GRID}"/>`);
    lines.push(`<text x="${PLOT.left - 10}" y="${y(cases) + 4}" font-size="11.5" text-anchor="end" fill="${INK_SECONDARY}">${cases}</text>`);
  }

  return lines.join("\n");
}

function passAxis(rows, x) {
  const ticks = rows.map(
    (row) => `<text x="${x(row.pass)}" y="${PLOT.bottom + 20}" font-size="11.5" text-anchor="middle" fill="${INK_SECONDARY}">${row.pass === 0 ? "baseline" : `pass ${row.pass}`}</text>`,
  );

  return ticks.join("\n");
}

// A dashed line in the gap after a pass, with what the human side added there.
function notes(x) {
  return NOTES.map((note) => {
    const at = (x(note.afterPass) + x(note.afterPass + 1)) / 2;
    const text = note.lines
      .map((line, index) => `<text x="${at}" y="${86 + index * 14}" font-size="11" text-anchor="middle" fill="${INK_SECONDARY}">${line}</text>`)
      .join("\n");

    return `<line x1="${at}" x2="${at}" y1="${PLOT.top - 4}" y2="${PLOT.bottom}" stroke="${REFERENCE}" stroke-dasharray="3 4"/>\n${text}`;
  }).join("\n");
}

// The size of the gold set: a step line, because the set grows between passes, not during one.
function totalLine(rows, x, y) {
  let path = `M ${x(rows[0].pass)} ${y(rows[0].total)}`;

  for (let index = 1; index < rows.length; index += 1) {
    const middle = (x(rows[index - 1].pass) + x(rows[index].pass)) / 2;
    path += ` H ${middle} V ${y(rows[index].total)} H ${x(rows[index].pass)}`;
  }

  return `<path d="${path}" fill="none" stroke="${REFERENCE}" stroke-width="1.5"/>`;
}

function passedLine(rows, x, y) {
  const points = rows.map((row) => `${x(row.pass)},${y(row.passed)}`).join(" ");
  const markers = rows.map(
    (row) => `<circle cx="${x(row.pass)}" cy="${y(row.passed)}" r="${MARKER_RADIUS}" fill="${SERIES}" stroke="${SURFACE}" stroke-width="2"><title>${row.pass === 0 ? "Baseline" : `Pass ${row.pass}`}: ${row.passed} of ${row.total} cases pass</title></circle>`,
  );
  const labels = rows
    .filter((row) => LABELLED_PASSES.includes(row.pass))
    .map((row) => `<text x="${x(row.pass) + LABEL_SHIFT.x}" y="${y(row.passed) + LABEL_SHIFT.y}" font-size="12" font-weight="600" fill="${INK}">${row.passed}</text>`);

  return [`<polyline points="${points}" fill="none" stroke="${SERIES}" stroke-width="2" stroke-linejoin="round"/>`, ...markers, ...labels].join("\n");
}

// Direct labels at the right end. The swatch carries the colour, the text stays in ink.
function endLabels(last, x, y) {
  const at = PLOT.right + 18;

  return [
    `<line x1="${at}" x2="${at + 16}" y1="${y(last.passed) + 14}" y2="${y(last.passed) + 14}" stroke="${SERIES}" stroke-width="2"/>`,
    `<text x="${at + 22}" y="${y(last.passed) + 18}" font-size="12" fill="${INK}">passing cases</text>`,
    `<line x1="${at}" x2="${at + 16}" y1="${y(last.total) - 12}" y2="${y(last.total) - 12}" stroke="${REFERENCE}" stroke-width="1.5"/>`,
    `<text x="${at + 22}" y="${y(last.total) - 8}" font-size="12" fill="${INK}">cases in the set</text>`,
  ].join("\n");
}

writeFileSync(CHART_FILE, `${chart(readLedger())}\n`);
console.log(`wrote ${path.relative(ROOT, CHART_FILE)}`);
