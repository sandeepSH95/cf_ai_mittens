/**
 * The text of every failure the adapter reports about the packages.
 *
 *   package is missing an export, returns a wrong shape or throws
 *        |
 *        v
 *   contractLine(text)  -->  "contract: mittens_sandbox must export createSandbox(options)"
 *
 * One failure is one line, so the loop's builder reads one fact per failing
 * case. This file has no imports: Node (checks.test.ts) and workerd (the
 * adapter) both load it.
 */

export const CONTRACT_PREFIX = "contract: ";

// A package error can hold many lines (a validation report). Keep the start.
const MAX_LINE_CHARS = 300;
const CUT_MARK = "...";
const LINE_BREAKS = /\s*[\r\n]+\s*/g;
const ONE_SPACE = " ";

/** Example: contractLine("unknown call 'x'") -> "contract: unknown call 'x'". */
export function contractLine(text: string): string {
  const oneLine = text.replace(LINE_BREAKS, ONE_SPACE).trim();

  if (oneLine.length <= MAX_LINE_CHARS) {
    return `${CONTRACT_PREFIX}${oneLine}`;
  }

  return `${CONTRACT_PREFIX}${oneLine.slice(0, MAX_LINE_CHARS)}${CUT_MARK}`;
}

/** Example: "mittens_sandbox must export createSandbox(options)". */
export function mustExport(packageName: string, signature: string): string {
  return `${packageName} must export ${signature}`;
}

/** Example: "no registry entry for the call 'facade.spec'". */
export function unknownCall(call: string): string {
  return `no registry entry for the call '${call}'`;
}
