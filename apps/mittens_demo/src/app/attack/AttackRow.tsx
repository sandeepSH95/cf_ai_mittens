import { ChevronDown, ChevronRight, ShieldAlert, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";

import { cn } from "@/lib/utils";

import { FAILED_LABEL, NOT_RUN_LABEL, Outcome, RUNNING_LABEL, RunPhase, WIDE_ONLY_CELL, type DisplayRow } from "./constants";

/** The table has four columns. The source row spans all of them. */
export const ATTACK_COLUMNS = 4;

/**
 * One attack: its name with the detail below it, criterion id, the expected verdict and the verdict. A row with a program
 * opens on a click and shows the source below it.
 */
export function AttackRowView({ row, phase, expected }: { row: DisplayRow; phase: RunPhase; expected: DisplayRow["outcome"] }) {
  const [open, setOpen] = useState(false);
  const sourceId = useId();
  const hasSource = row.code.length > 0;
  const showSource = open && hasSource;

  return (
    <>
      <TableRow>
        <TableCell className="whitespace-nowrap">
          <div className="font-medium">
          {hasSource ? (
            <button
              type="button"
              aria-expanded={open}
              aria-controls={sourceId}
              onClick={() => setOpen(!open)}
              className="inline-flex items-center gap-1 rounded-sm text-left outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
            >
              {open ? <ChevronDown aria-hidden="true" className="size-4" /> : <ChevronRight aria-hidden="true" className="size-4" />}
              {row.name}
              <span className="sr-only">{open ? ", hide the program" : ", show the program"}</span>
            </button>
          ) : (
            <span className="pl-5">{row.name}</span>
          )}
          </div>

          {/* The detail wraps under the name, so the name itself is never broken over two lines. */}
          {row.detail.length > 0 ? <p className="mt-1 pl-5 text-xs whitespace-normal text-muted-foreground">{row.detail}</p> : null}
        </TableCell>

        <TableCell className={cn(WIDE_ONLY_CELL, "font-mono text-xs text-muted-foreground")}>{row.criterion}</TableCell>

        {/* Plain text, not a badge: the expected verdict is a reference, the outcome is the result. */}
        <TableCell className={cn(WIDE_ONLY_CELL, "text-xs text-muted-foreground")}>{expected}</TableCell>

        <TableCell>
          <OutcomeBadge outcome={row.outcome} phase={phase} />
        </TableCell>

      </TableRow>

      {showSource ? (
        <TableRow id={sourceId} className="hover:bg-transparent">
          <TableCell colSpan={ATTACK_COLUMNS} className="whitespace-normal">
            <CodeBlock aria-label={`Program of the attack ${row.name}`}>{row.code}</CodeBlock>
          </TableCell>
        </TableRow>
      ) : null}
    </>
  );
}

/** The verdict as text with an icon, so colour is never the only signal. */
function OutcomeBadge({ outcome, phase }: { outcome: DisplayRow["outcome"]; phase: RunPhase }) {
  if (outcome === Outcome.Held) {
    return (
      <Badge variant="success">
        <ShieldCheck aria-hidden="true" />
        {Outcome.Held}
      </Badge>
    );
  }

  if (outcome === Outcome.Breached) {
    return (
      <Badge variant="destructive">
        <ShieldAlert aria-hidden="true" />
        {Outcome.Breached}
      </Badge>
    );
  }

  return <Badge variant="outline">{pendingLabel(phase)}</Badge>;
}

/** The word for a row with no verdict. Example: "running" while the calls are in flight. */
export function pendingLabel(phase: RunPhase): string {
  if (phase === RunPhase.Loading) {
    return RUNNING_LABEL;
  }

  if (phase === RunPhase.Failed) {
    return FAILED_LABEL;
  }

  return NOT_RUN_LABEL;
}
