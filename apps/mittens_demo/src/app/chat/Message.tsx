import { isToolUIPart, type UIMessage } from "ai";

import { Badge } from "@/components/ui/badge";

import type { ApprovalHandler } from "./constants";
import { ToolPart } from "./ToolPart";

/** One message: the role, then its text parts and tool parts in the order the model sent them. */
export function Message({ message, onApproval }: { message: UIMessage; onApproval: ApprovalHandler }) {
  return (
    <article className="flex flex-col gap-2 rounded-lg border p-3 text-sm">
      <Badge variant="secondary">{message.role}</Badge>

      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return (
            <p key={index} className="leading-relaxed whitespace-pre-wrap">
              {part.text}
            </p>
          );
        }

        if (isToolUIPart(part)) {
          return <ToolPart key={part.toolCallId} part={part} onApproval={onApproval} />;
        }

        return null;
      })}
    </article>
  );
}
