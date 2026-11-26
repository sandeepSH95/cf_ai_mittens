/**
 * defineReads: turns a map of read methods into the facade the gate serves
 * and the declaration text the model reads.
 *
 *   defineReads({ getRepo: { input, output, handler } })
 *        |
 *        +--> facade.getRepo(raw)   parses raw with input.schema, then calls handler
 *        +--> spec()                "declare const github: { getRepo(): Promise<Repo>; };"
 *
 * The input comes from generated code, so the handler (and the driver
 * behind it) never sees a value the schema did not accept.
 */
import type { z } from "zod";
import { SANDBOX_NAMESPACE } from "mittens_sandbox";

const READ_KEYS = ["input", "output", "handler"] as const;

/** `declaration` is the parameter text of the method. Example: "input: { number: number }". Null: no parameter. */
export type ReadInput = { schema: z.ZodType; declaration: string | null };

/** `declaration` is the type the method resolves to. Example: "PullRequest[]". */
export type ReadOutput = { declaration: string };

export type ReadEntry = {
  input: ReadInput;
  output: ReadOutput;
  // The handler receives the parsed input. Its own signature states the type.
  handler: (input: any) => Promise<unknown>;
};

export type ReadsOptions = {
  /** The name of the global inside the isolate. Default: "github". */
  namespace?: string;
  /** Type aliases the declarations use, placed before the namespace. */
  types?: string;
  /** One line of doc comment above the namespace. */
  about?: string;
};

export type ReadFacade<T extends Record<string, ReadEntry>> = {
  readonly [M in keyof T]: (input?: unknown) => ReturnType<T[M]["handler"]>;
};

export type Reads<T extends Record<string, ReadEntry>> = { facade: ReadFacade<T>; spec: () => string };

export function defineReads<T extends Record<string, ReadEntry>>(entries: T, options: ReadsOptions = {}): Reads<T> {
  const methods = Object.keys(entries);

  // The key check of every entry runs before any check of a value.
  for (const method of methods) {
    checkKeys(method, entries[method]);
  }

  for (const method of methods) {
    checkValues(method, entries[method]);
  }

  const facade: Record<string, (input?: unknown) => Promise<unknown>> = {};

  for (const method of methods) {
    facade[method] = (input?: unknown) => callRead(method, entries[method], input);
  }

  const text = declarationText(entries, options);

  return { facade: Object.freeze(facade) as ReadFacade<T>, spec: () => text };
}

/** Example: an entry with no `input` throws "defineReads: 'getRepo' is missing 'input'". */
function checkKeys(method: string, entry: unknown): void {
  if (typeof entry !== "object" || entry === null) {
    throw new TypeError(`defineReads: '${method}' must be { input, output, handler }`);
  }

  for (const key of READ_KEYS) {
    if (!(key in entry)) {
      throw new TypeError(`defineReads: '${method}' is missing '${key}'`);
    }
  }
}

function checkValues(method: string, entry: ReadEntry): void {
  if (typeof entry.input?.schema?.safeParse !== "function") {
    throw new TypeError(`defineReads: 'input' of '${method}' needs a schema`);
  }

  if (typeof entry.output?.declaration !== "string") {
    throw new TypeError(`defineReads: 'output' of '${method}' needs a declaration`);
  }

  if (typeof entry.handler !== "function") {
    throw new TypeError(`defineReads: 'handler' of '${method}' must be a function`);
  }
}

/**
 * Parses the input on the host, then calls the handler.
 * Example: getPullRequest({ number: "101" }) rejects with
 * "getPullRequest: 'number' must be a positive integer" and the handler does not run.
 */
async function callRead(method: string, entry: ReadEntry, input: unknown): Promise<unknown> {
  const parsed = entry.input.schema.safeParse(input ?? {});

  if (!parsed.success) {
    throw new TypeError(`${method}: ${issueText(parsed.error.issues[0])}`);
  }

  return entry.handler(parsed.data);
}

/** Example: path ["number"], message "must be a positive integer" gives "'number' must be a positive integer". */
export function issueText(issue: { path: PropertyKey[]; message: string } | undefined): string {
  if (issue === undefined) {
    return "the input is not valid";
  }

  if (issue.path.length === 0) {
    return issue.message;
  }

  return `'${issue.path.map(String).join(".")}' ${issue.message}`;
}

function declarationText(entries: Record<string, ReadEntry>, options: ReadsOptions): string {
  const lines: string[] = [];

  if (options.types !== undefined) {
    lines.push(options.types, "");
  }

  if (options.about !== undefined) {
    lines.push(`/** ${options.about} */`);
  }

  lines.push(`declare const ${options.namespace ?? SANDBOX_NAMESPACE}: {`);

  for (const [method, entry] of Object.entries(entries)) {
    lines.push(`  ${method}(${entry.input.declaration ?? ""}): Promise<${entry.output.declaration}>;`);
  }

  lines.push("};");

  return lines.join("\n");
}
