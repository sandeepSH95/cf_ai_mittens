/**
 * How a rejected tool call reaches the model.
 *
 *   human rejects apply_writes
 *     chat store:  part.state "output-denied", approval.approved false
 *     AI SDK:      "output-denied"       -> tool result { type: "error-text" }
 *                  "approval-responded"  -> tool result { type: "execution-denied" }
 *
 * The model must read a human's "no" as a denial, not as a tool that failed.
 * So the prompt shows a denied part in the state "approval-responded".
 * The stored chat does not change: the page still shows "output-denied".
 */
import type { UIMessage } from "ai";

/** The states of a tool part that carry the human's answer (AI SDK UI message parts). */
const PartState = { OutputDenied: "output-denied", ApprovalResponded: "approval-responded" } as const;

type Part = UIMessage["parts"][number];

/**
 * Returns the messages for the prompt, with each denied tool part as a denied approval response.
 * Example: { type: "tool-apply_writes", state: "output-denied", approval: { id, approved: false } }
 *   becomes { type: "tool-apply_writes", state: "approval-responded", approval: { id, approved: false } }.
 */
export function deniedAsResponded(messages: UIMessage[]): UIMessage[] {
  return messages.map((message) => ({ ...message, parts: message.parts.map(asResponded) }));
}

function asResponded(part: Part): Part {
  const candidate = part as { state?: string; approval?: { approved?: boolean } };

  if (candidate.state !== PartState.OutputDenied || candidate.approval?.approved !== false) {
    return part;
  }

  return { ...part, state: PartState.ApprovalResponded } as Part;
}
