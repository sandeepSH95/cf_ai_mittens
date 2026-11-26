import { getToolName, type DynamicToolUIPart, type ToolUIPart } from "ai";
import { Check, X } from "lucide-react";

import { CodeBlock } from "@/components/code-block";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

import { APPLY_TOOL, APPROVAL_REQUESTED, CODE_TOOL, OUTPUT_AVAILABLE, OUTPUT_DENIED, OUTPUT_ERROR, type ApprovalHandler } from "./constants";

/**
 * One tool call. `code` shows the program the model wrote. `apply_writes`
 * shows the write plan, with Approve and Reject while a human must decide.
 */
export function ToolPart({ part, onApproval }: { part: ToolUIPart | DynamicToolUIPart; onApproval: ApprovalHandler }) {
  const name = getToolName(part);
  const input = part.input as { code?: string; plan?: unknown } | undefined;

  return (
    <div className="flex flex-col gap-2 rounded-md bg-muted/50 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-semibold">{name}</span>
        <Badge variant="outline">{part.state}</Badge>
      </div>

      {name === CODE_TOOL && input?.code !== undefined ? <CodeBlock>{input.code}</CodeBlock> : null}
      {name === APPLY_TOOL && input?.plan !== undefined ? <CodeBlock>{JSON.stringify(input.plan, null, 2)}</CodeBlock> : null}

      {part.state === APPROVAL_REQUESTED && "approval" in part ? (
        <div className="flex gap-2">
          <Button type="button" size="sm" onClick={() => onApproval({ id: part.approval.id, approved: true })}>
            <Check aria-hidden="true" />
            Approve
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={() => onApproval({ id: part.approval.id, approved: false })}>
            <X aria-hidden="true" />
            Reject
          </Button>
        </div>
      ) : null}

      {part.state === OUTPUT_DENIED ? <p className="text-sm">Denied. Nothing was written.</p> : null}
      {part.state === OUTPUT_AVAILABLE ? <CodeBlock>{JSON.stringify(part.output, null, 2)}</CodeBlock> : null}
      {part.state === OUTPUT_ERROR ? <CodeBlock>{part.errorText}</CodeBlock> : null}
    </div>
  );
}
