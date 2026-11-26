import { Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";

import type { AttackRun } from "../../services/attack-run";
import { AttackRowView, pendingLabel } from "./AttackRow";
import { ATTACK_COUNT, PENDING_ATTACKS, RunPhase, type DisplayRow } from "./constants";

const NO_BREACH = 0;

type AttackCardProps = {
  title: string;
  description: string;

  // Null before the first run, while a run is in flight and after a failed run.
  run: AttackRun | null;
  phase: RunPhase;
};

/**
 * The report of one executor.
 *
 *   +--------------------------------------------+
 *   | title                    [0 of 8 breached] |
 *   | description                         412 ms |
 *   | attack | criterion | outcome | detail      |
 *   | > network fetch | SBX-001 | held | ...     |
 *   +--------------------------------------------+
 */
export function AttackCard({ title, description, run, phase }: AttackCardProps) {
  const rows = toDisplayRows(run);

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h3>{title}</h3>
        </CardTitle>
        <CardDescription>{description}</CardDescription>

        <CardAction className="flex flex-col items-end gap-1">
          <SummaryBadge run={run} phase={phase} />
          <span className="text-xs text-muted-foreground tabular-nums">{run === null ? "duration: n/a" : `${run.durationMs} ms`}</span>
        </CardAction>
      </CardHeader>

      <CardContent>
        <Table>
          <caption className="sr-only">{`${title}: the outcome of each attack`}</caption>

          <TableHeader>
            <TableRow>
              <TableHead scope="col">Attack</TableHead>
              <TableHead scope="col">Criterion</TableHead>
              <TableHead scope="col">Outcome</TableHead>
              <TableHead scope="col">Detail</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {rows.map((row) => (
              <AttackRowView key={row.name} row={row} phase={phase} />
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
