import { CircleAlert, CircleCheck, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { AttackRun } from "../../services/attack-run";
import { AttackRowView, pendingLabel } from "./AttackRow";
import { ATTACK_COUNT, Outcome, PENDING_ATTACKS, RunPhase, type DisplayRow } from "./constants";

const NO_BREACH = 0;

type AttackCardProps = {
  title: string;
  description: string;

  // What this executor is in the comparison. Example: "the project", "control, unsafe on purpose".
  role: string;

  // The names of the attacks that a correct run reports as breached. Empty for the real sandbox.
  expectedBreaches: readonly string[];

  // One sentence on why that is the expected result.
  expectedReason: string;

  // Null before the first run, while a run is in flight and after a failed run.
  run: AttackRun | null;
  phase: RunPhase;
};

/**
 * The report of one executor.
 *
 *   +--------------------------------------------+
 *   | title [role]             [0 of 8 breached] |
 *   | description                         412 ms |
 *   | Expected: 0 of 8 breached. why             |
 *   | Result: as expected                        |
 *   | attack | criterion | expected | outcome | detail |
 *   +--------------------------------------------+
 */
export function AttackCard({ title, description, role, expectedBreaches, expectedReason, run, phase }: AttackCardProps) {
  const rows = toDisplayRows(run);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <h3>{title}</h3>
          <Badge variant="outline">{role}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>

        <CardAction className="flex flex-col items-end gap-1">
          <SummaryBadge run={run} phase={phase} />
          <span className="text-xs text-muted-foreground tabular-nums">{run === null ? "duration: n/a" : `${run.durationMs} ms`}</span>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        <ExpectedNote expectedBreaches={expectedBreaches} reason={expectedReason} run={run} />

        {/* Fixed column widths: the detail text wraps inside the card and is never cut off. */}
        <Table className="table-fixed">
          <caption className="sr-only">{`${title}: the outcome of each attack`}</caption>

          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="w-[26%]">Attack</TableHead>
              <TableHead scope="col" className="w-[13%]">Criterion</TableHead>
              <TableHead scope="col" className="w-[13%]">Expected</TableHead>
              <TableHead scope="col" className="w-[18%]">Outcome</TableHead>
              <TableHead scope="col" className="w-[30%]">Detail</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => (
              <AttackRowView key={row.name} row={row} phase={phase} expected={expectedOutcome(row.name, expectedBreaches)} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Example: expectedOutcome("env inspection", ["env inspection"]) is "breached". */
function expectedOutcome(name: string, expectedBreaches: readonly string[]): DisplayRow["outcome"] {
  return expectedBreaches.includes(name) ? Outcome.Breached : Outcome.Held;
}

/** True when the report's breached attacks are exactly the expected ones. */
function isAsExpected(run: AttackRun, expectedBreaches: readonly string[]): boolean {
  const breached = run.cases.filter((row) => row.outcome === Outcome.Breached).map((row) => row.name);

  return breached.length === expectedBreaches.length && breached.every((name) => expectedBreaches.includes(name));
}

/**
 * States the expected result before the run, and after the run says in words
 * if the report matches it. A breach in the control card is then read as a
 * pass of the comparison, not as a fault of the project.
 */
function ExpectedNote({ expectedBreaches, reason, run }: { expectedBreaches: readonly string[]; reason: string; run: AttackRun | null }) {
  const names = expectedBreaches.length > 0 ? ` (${expectedBreaches.join(", ")})` : "";

  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-muted/40 p-3 text-sm">
      <p>
        <span className="font-medium">{`Expected: ${expectedBreaches.length} of ${ATTACK_COUNT} breached${names}.`}</span> <span className="text-muted-foreground">{reason}</span>
      </p>

      {run === null ? null : <ResultLine matches={isAsExpected(run, expectedBreaches) ? Match.Yes : Match.No} />}
    </div>
  );
}

/** Does the report match the expected result. A const object, not a boolean, so the call site reads. */
const Match = { Yes: "yes", No: "no" } as const;

type Match = (typeof Match)[keyof typeof Match];

function ResultLine({ matches }: { matches: Match }) {
  if (matches === Match.Yes) {
    return (
      <p className="flex items-center gap-1.5 font-medium">
        <CircleCheck aria-hidden="true" className="size-4 text-success" />
        Result: as expected.
      </p>
    );
  }

  return (
    <p role="alert" className="flex items-center gap-1.5 font-medium text-destructive">
      <CircleAlert aria-hidden="true" className="size-4" />
      Result: not as expected. This is a fault. Compare the Expected and Outcome columns.
    </p>
  );
}

/** The rows of the report, or the eight attack names with no verdict when there is no report. */
function toDisplayRows(run: AttackRun | null): DisplayRow[] {
  if (run === null) {
    return PENDING_ATTACKS.map((attack) => ({ ...attack, outcome: null, detail: "", code: "" }));
  }

  return run.cases;
}

/** Example: "0 of 8 breached" in the success style, "1 of 8 breached" in the destructive style. */
function SummaryBadge({ run, phase }: { run: AttackRun | null; phase: RunPhase }) {
  if (run === null) {
    return (
      <Badge variant="outline">
        {phase === RunPhase.Loading ? <Loader2 aria-hidden="true" className="animate-spin" /> : null}
        {pendingLabel(phase)}
      </Badge>
    );
  }

  const total = run.cases.length > 0 ? run.cases.length : ATTACK_COUNT;
  const variant = run.breached === NO_BREACH ? "success" : "destructive";

  return <Badge variant={variant}>{`${run.breached} of ${total} breached`}</Badge>;
}
