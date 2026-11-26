/**
 * The two tools the chat model sees.
 *
 *   code          createCodeTool from @cloudflare/codemode/ai over the sandbox executor.
 *                 Input { code }, runs ONE program against `github.*`, returns its result.
 *   apply_writes  the applyWritesTool of defineWrites: needsApproval: true. It validates
 *                 a plan and applies it host-side only after a human approved the call.
 */
import type { Executor } from "@cloudflare/codemode";
import { createCodeTool } from "@cloudflare/codemode/ai";
import type { ToolSet } from "ai";
import { SANDBOX_NAMESPACE } from "mittens_sandbox";
import { EXAMPLE_PROGRAM, facadeDescriptors } from "./facade";
import type { Writes } from "./writes";

export const ToolName = { Code: "code", ApplyWrites: "apply_writes" } as const;
export type ToolName = (typeof ToolName)[keyof typeof ToolName];

/** One user turn: program, apply_writes, final answer, plus room for one retry. */
export const MAX_STEPS = 6;

export const SYSTEM_PROMPT = `You are a GitHub maintenance assistant for one repository.
You act by writing ONE JavaScript program with the "${ToolName.Code}" tool. The program runs in a sandbox with no network and can only call the read-only "${SANDBOX_NAMESPACE}" API. Make every read inside that one program instead of calling tools repeatedly.
The program must never try to write. If the user wants changes (comments, closing), the program returns them as { plan: WritePlan } and you then call "${ToolName.ApplyWrites}" with that plan. A human approves or rejects the call; respect the answer.
Answer briefly in plain language. Do not invent data; report what the program returned.`;

/** Example: codeDescription(writes.planSpec()). The code tool puts the read declarations at {{types}}. */
function codeDescription(planSpec: string): string {
  return `Run ONE JavaScript program against the read-only GitHub facade and return its result.

The program runs in an isolated sandbox with no network: fetch() throws. The only API is the global "${SANDBOX_NAMESPACE}" declared below. Prefer one program that makes every call it needs over several tool calls.

{{types}}

${planSpec}

Rules: write an async arrow function in JavaScript that returns a JSON value. Do NOT use TypeScript syntax. Do NOT define named functions and then call them; write the arrow function body directly. Writes are never executed by the program: return them as { plan: WritePlan } and call ${ToolName.ApplyWrites} afterwards.

Example:
${EXAMPLE_PROGRAM}`;
}

/** `reads` and `writes` are what defineReads and defineWrites returned. */
export type AgentToolOptions = { executor: Executor; reads: { spec: () => string }; writes: Pick<Writes, "planSpec" | "applyWritesTool"> };

export function createAgentTools(options: AgentToolOptions): ToolSet {
  const code = createCodeTool({
    tools: [{ name: SANDBOX_NAMESPACE, tools: facadeDescriptors(), types: options.reads.spec() }],
    executor: options.executor,
    description: codeDescription(options.writes.planSpec())
  });

  return { [ToolName.Code]: code, [ToolName.ApplyWrites]: options.writes.applyWritesTool };
}
