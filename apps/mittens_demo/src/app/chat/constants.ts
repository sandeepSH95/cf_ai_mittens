/** The fixed names of the chat tab: the agent, its tools and the states of a tool part. */
export const AGENT_NAME = "coder-agent";
export const DEFAULT_ROOM = "default";
export const CODE_TOOL = "code";
export const APPLY_TOOL = "apply_writes";
export const STREAMING = "streaming";
export const APPROVAL_REQUESTED = "approval-requested";
export const OUTPUT_DENIED = "output-denied";
export const OUTPUT_AVAILABLE = "output-available";
export const OUTPUT_ERROR = "output-error";
export const EXAMPLE_PROMPT = "List my open pull requests older than 30 days and draft a closing comment for each.";

/** Sends the human's answer to an approval request. Example: { id: "a1", approved: false } rejects the plan. */
export type ApprovalHandler = (response: { id: string; approved: boolean }) => void;
