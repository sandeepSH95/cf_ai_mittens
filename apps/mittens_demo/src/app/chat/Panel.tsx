import { CodeBlock } from "@/components/code-block";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";

import type { CoderState } from "../../server";

/** The side panel: the last program the model wrote and the ledger row of its run. */
export function Panel({ state }: { state: CoderState | undefined }) {
  const row = state?.lastLedger ?? null;

  return (
    <Card className="h-fit">
      <CardHeader>
        <CardTitle>
          <h2>Last program</h2>
        </CardTitle>
      </CardHeader>

      <CardContent>
        <CodeBlock>{state?.lastProgram ?? "(no program yet)"}</CodeBlock>
      </CardContent>

      <CardHeader>
        <CardTitle>
          <h2>Ledger row</h2>
        </CardTitle>
      </CardHeader>

      <CardContent>
        {row === null ? (
          <p className="text-sm text-muted-foreground">(no run yet)</p>
        ) : (
          <Table>
            <TableBody>
              <Row label="run id" value={row.id} />
              <Row label="model" value={state?.modelId ?? "?"} />
              <Row label="facade calls in one program" value={row.facadeCalls} />
              <Row label="model round trips" value={row.roundTrips} />
              <Row label="isolate start ms" value={row.isolateStartMs ?? "n/a"} />
              <Row label="duration ms" value={row.durationMs} />
              <Row label="tokens in" value={row.tokensIn ?? "pending"} />
              <Row label="tokens out" value={row.tokensOut ?? "pending"} />
              <Row label="error" value={row.error ?? "none"} />
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}

/** One fact of the ledger row. The label is the row header. Example: "model round trips" and 1. */
function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <TableRow>
      <th scope="row" className="p-2 text-left align-top font-normal whitespace-normal text-muted-foreground">
        {label}
      </th>
      <TableCell className="align-top font-mono text-xs break-all whitespace-normal">{String(value)}</TableCell>
    </TableRow>
  );
}
