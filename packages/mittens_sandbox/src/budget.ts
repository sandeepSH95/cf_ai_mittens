/**
 * Iteration budget for generated programs.
 *
 * Local workerd does not enforce `limits.cpuMs` (verified 18 Nov 2026: a
 * `while (true) {}` inside a Dynamic Worker blocked the local runtime and
 * the host timer never fired). This module rewrites the program so every
 * loop body and function body starts with `__tick()`. The sandbox shim
 * throws once the tick count passes the budget, so a runaway program ends
 * with an error instead of a hang. In production `limits.cpuMs` is the
 * hard stop and this budget is the first line.
 *
 *   async () => { while (true) {} }
 *   becomes
 *   async () => {__tick(); while (true) {__tick();} }
 */
import * as acorn from "acorn";

export const TICK_IDENTIFIER = "__tick";

const LOOP_TYPES = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);
const FUNCTION_TYPES = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
const BLOCK_STATEMENT = "BlockStatement";
const IDENTIFIER = "Identifier";

const TICK_CALL = `${TICK_IDENTIFIER}();`;

type Edit = { at: number; text: string };
type Node = { type: string; start: number; end: number } & Record<string, unknown>;

export type BudgetResult = { ok: true; code: string } | { ok: false; error: string };

/** Returns the instrumented source, or an error when the program is not parseable or uses the reserved name. */
export function applyBudget(source: string): BudgetResult {
  let program: acorn.Program;

  try {
    // preserveParens keeps `(pr) => ({ ... })` bodies as ParenthesizedExpression
    // nodes whose range includes the parens, so the wrap below stays valid JS.
    program = acorn.parse(source, { ecmaVersion: "latest", sourceType: "module", preserveParens: true });
  } catch (error) {
    return { ok: false, error: `Program does not parse: ${error instanceof Error ? error.message : String(error)}` };
  }

  const edits: Edit[] = [];
  let reserved = false;

  walk(program as unknown as Node, (node) => {
    if (node.type === IDENTIFIER && node.name === TICK_IDENTIFIER) {
      reserved = true;
      return;
    }

    if (LOOP_TYPES.has(node.type)) {
      edits.push(...bodyEdits(node.body as Node, EditKind.Loop));
      return;
    }

    if (FUNCTION_TYPES.has(node.type)) {
      edits.push(...bodyEdits(node.body as Node, EditKind.Function));
    }
  });

  if (reserved) {
    return { ok: false, error: `Program must not use the reserved identifier ${TICK_IDENTIFIER}` };
  }

  return { ok: true, code: applyEdits(source, edits) };
}

const EditKind = { Loop: "loop", Function: "function" } as const;
type EditKind = (typeof EditKind)[keyof typeof EditKind];

// A block body gets the tick after its opening brace. A bare body
// (`while (x) y();` or `() => expr`) is wrapped into a block first.
function bodyEdits(body: Node, kind: EditKind): Edit[] {
  if (body.type === BLOCK_STATEMENT) {
    return [{ at: body.start + 1, text: TICK_CALL }];
  }

  if (kind === EditKind.Function) {
    return [
      { at: body.start, text: `{${TICK_CALL} return (` },
      { at: body.end, text: `); }` }
    ];
  }

  return [
    { at: body.start, text: `{${TICK_CALL} ` },
    { at: body.end, text: ` }` }
  ];
}

// Apply from the end so earlier offsets stay valid.
function applyEdits(source: string, edits: Edit[]): string {
  const ordered = [...edits].sort((a, b) => b.at - a.at);
  let out = source;

  for (const edit of ordered) {
    out = out.slice(0, edit.at) + edit.text + out.slice(edit.at);
  }

  return out;
}

// Generic ESTree walk: every object with a string `type` is a node.
function walk(node: Node, visit: (node: Node) => void): void {
  visit(node);

  for (const value of Object.values(node)) {
    if (Array.isArray(value)) {
      for (const item of value) {
        if (isNode(item)) {
          walk(item, visit);
        }
      }
      continue;
    }

    if (isNode(value)) {
      walk(value, visit);
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as { type?: unknown }).type === "string";
}
