/**
 * Model driver layer.
 *
 *   services/turn.ts
 *          |  model(): LanguageModel
 *          v
 *   ModelDriver (interface)
 *     +-- WorkersAiModelDriver   createAI({ binding: env.AI })("@cf/openai/gpt-oss-120b")
 *     +-- StubModelDriver        scripted MockLanguageModelV3: code tool -> apply_writes -> text
 *
 * Selected by MODEL_DRIVER: "workers-ai" | "stub" (default "stub").
 * The stub needs the names of the two agent tools and a fixed program,
 * so the service layer passes a StubScript in.
 */
import { createAI, type WorkersAIModelId } from "agents/models/ai-sdk";
import type { LanguageModel } from "ai";
import { MockLanguageModelV3 } from "ai/test";

export const ModelDriverKind = { WorkersAi: "workers-ai", Stub: "stub" } as const;
export type ModelDriverKind = (typeof ModelDriverKind)[keyof typeof ModelDriverKind];

export const WORKERS_AI_MODEL: WorkersAIModelId = "@cf/openai/gpt-oss-120b";
const STUB_PROVIDER = "stub";

/**
 * The most tokens one model answer may have. Workers AI ends an answer at
 * 256 tokens when the caller names no limit, and that cuts a tool call in
 * the middle of its program. Example: a 40-line program is about 600 tokens.
 */
export const MAX_OUTPUT_TOKENS = 4096;
const STUB_MODEL_ID = "stub/mittens";

/** Fixed token counts the stub reports. They exist so the ledger columns are exercised; they measure nothing. */
const STUB_USAGE = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 80, text: 80, reasoning: 0 }
};

export interface ModelDriver {
  readonly kind: ModelDriverKind;
  readonly modelId: string;
  readonly maxOutputTokens: number;
  model(): LanguageModel;
}

/** Real implementation. Needs the AI binding, which needs `wrangler login`. */
export class WorkersAiModelDriver implements ModelDriver {
  readonly kind = ModelDriverKind.WorkersAi;
  readonly modelId: WorkersAIModelId;
  readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  readonly #binding: Ai;

  constructor(binding: Ai, modelId: WorkersAIModelId = WORKERS_AI_MODEL) {
    this.#binding = binding;
    this.modelId = modelId;
  }

  model(): LanguageModel {
    return createAI({ binding: this.#binding })(this.modelId);
  }
}

/** What the stub needs to know about the agent's tools. */
export type StubScript = { codeTool: string; applyTool: string; program: string };

type StreamOptions = Parameters<MockLanguageModelV3["doStream"]>[0];
type StreamResult = Awaited<ReturnType<MockLanguageModelV3["doStream"]>>;
type StreamPart = StreamResult["stream"] extends ReadableStream<infer Part> ? Part : never;
type PromptToolResult = { toolName: string; output: { type: string; value?: unknown } };

export type ScriptedTurn = { toolCall: { name: string; input: unknown } } | { text: string };

const OutputType = { Json: "json", Text: "text", ExecutionDenied: "execution-denied" } as const;
const ERROR_OUTPUT_PREFIX = "error";

/**
 * Deterministic model. It reads the tool results in the prompt and plays
 * the next move:
 *   no code result yet          -> call the code tool with the fixed program
 *   code result with a plan     -> call apply_writes with that plan
 *   apply result or denial      -> final text
 */
export class StubModelDriver implements ModelDriver {
  readonly kind = ModelDriverKind.Stub;
  readonly modelId = STUB_MODEL_ID;
  readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  readonly #script: StubScript;

  constructor(script: StubScript) {
    this.#script = script;
  }

  model(): LanguageModel {
    return new MockLanguageModelV3({
      provider: STUB_PROVIDER,
      modelId: STUB_MODEL_ID,
      doStream: async (options) => ({ stream: toStream(turnParts(this.#nextTurn(options))) })
    });
  }

  #nextTurn(options: StreamOptions): ScriptedTurn {
    const results = toolResults(options.prompt);
    const codeResult = results.findLast((result) => result.toolName === this.#script.codeTool);
    const applyResult = results.findLast((result) => result.toolName === this.#script.applyTool);

    if (codeResult === undefined) {
      return { toolCall: { name: this.#script.codeTool, input: { code: this.#script.program } } };
    }

    if (applyResult !== undefined) {
      return { text: describeApply(applyResult) };
    }

    if (applyResult === undefined && codeResult.output.type.startsWith(ERROR_OUTPUT_PREFIX)) {
      return { text: `The program failed: ${stringify(codeResult.output.value)}` };
    }

    const plan = planFromResult(codeResult);

    if (plan === null) {
      return { text: `The program returned no write plan. Result: ${stringify(outputValue(codeResult))}` };
    }

    return { toolCall: { name: this.#script.applyTool, input: { plan } } };
  }
}

/**
 * One step of a script, as the verifier's contract writes it:
 *   { tool: "code", program }   call the code tool with this program text
 *   { tool: "apply_writes" }    call the apply tool with the plan of the last program result
 *   { text }                    answer with this text
 */
export type ScriptStep = { tool: string; program?: string } | { text: string };

/** Played when a script has no step: the model says nothing and the turn ends. */
const SILENT_STEP: ScriptStep = { text: "" };

/**
 * A model that plays one script step per model call, in order. The last
 * step repeats, so a script of one tool call never ends by itself and the
 * agent's step limit must stop it.
 *
 * One instance lives as long as its script: the count of played steps must
 * survive the pause for the human's approval, when the agent builds a new
 * model object for the rest of the turn.
 */
export class ScriptedModelDriver implements ModelDriver {
  readonly kind = ModelDriverKind.Stub;
  readonly modelId = STUB_MODEL_ID;
  readonly maxOutputTokens = MAX_OUTPUT_TOKENS;
  readonly #steps: ScriptStep[];
  readonly #tools: Pick<StubScript, "codeTool" | "applyTool">;
  #played = 0;
  #lastPrompt: StreamOptions["prompt"] = [];

  constructor(steps: ScriptStep[], tools: Pick<StubScript, "codeTool" | "applyTool">) {
    this.#steps = steps.length > 0 ? steps : [SILENT_STEP];
    this.#tools = tools;
  }

  model(): LanguageModel {
    return new MockLanguageModelV3({
      provider: STUB_PROVIDER,
      modelId: STUB_MODEL_ID,
      doStream: async (options) => ({ stream: toStream(turnParts(this.#nextTurn(options))) })
    });
  }

  /**
   * The `output.type` of the last result of one tool in the last prompt this model received.
   * Example: "execution-denied" after the human rejected apply_writes. Null when the prompt has none.
   */
  lastOutputType(toolName: string): string | null {
    const result = toolResults(this.#lastPrompt).findLast((candidate) => candidate.toolName === toolName);

    return result?.output.type ?? null;
  }

  #nextTurn(options: StreamOptions): ScriptedTurn {
    const step = this.#steps[Math.min(this.#played, this.#steps.length - 1)];

    this.#played += 1;
    this.#lastPrompt = options.prompt;

    if ("text" in step) {
      return { text: step.text };
    }

    if (step.tool !== this.#tools.applyTool) {
      return { toolCall: { name: step.tool, input: { code: step.program ?? "" } } };
    }

    // The script names no plan: the model passes on what the last program returned.
    const codeResult = toolResults(options.prompt).findLast((result) => result.toolName === this.#tools.codeTool);
    const plan = codeResult === undefined ? null : planFromResult(codeResult);

    return { toolCall: { name: step.tool, input: { plan } } };
  }
}

/** A model that plays fixed turns in order; the last turn repeats. For tests. */
export function scriptedModel(turns: ScriptedTurn[]): MockLanguageModelV3 {
  let index = 0;

  return new MockLanguageModelV3({
    provider: STUB_PROVIDER,
    modelId: STUB_MODEL_ID,
    doStream: async () => {
      const turn = turns[Math.min(index, turns.length - 1)];
      index += 1;
      return { stream: toStream(turnParts(turn)) };
    }
  });
}

export type ModelDriverEnv = { MODEL_DRIVER?: string; MODEL_ID?: string; AI?: Ai };

/** Picks the driver from MODEL_DRIVER. The stub needs no account. */
export function createModelDriver(env: ModelDriverEnv, script: StubScript): ModelDriver {
  const kind = env.MODEL_DRIVER ?? ModelDriverKind.Stub;

  if (kind === ModelDriverKind.Stub) {
    return new StubModelDriver(script);
  }

  if (kind !== ModelDriverKind.WorkersAi) {
    throw new Error(`Unknown MODEL_DRIVER "${kind}". Use "workers-ai" or "stub".`);
  }

  if (!env.AI) {
    throw new Error("MODEL_DRIVER=workers-ai needs the AI binding (wrangler.jsonc ai.binding) and wrangler login");
  }

  const modelId = (env.MODEL_ID as WorkersAIModelId | undefined) ?? WORKERS_AI_MODEL;
  return new WorkersAiModelDriver(env.AI, modelId);
}

function turnParts(turn: ScriptedTurn): StreamPart[] {
  if ("text" in turn) {
    return textParts(turn.text);
  }

  return toolCallParts(turn.toolCall.name, turn.toolCall.input);
}

function toolCallParts(toolName: string, input: unknown): StreamPart[] {
  const id = `call_${crypto.randomUUID()}`;
  const json = JSON.stringify(input);

  return [
    { type: "stream-start", warnings: [] },
    { type: "tool-input-start", id, toolName },
    { type: "tool-input-delta", id, delta: json },
    { type: "tool-input-end", id },
    { type: "tool-call", toolCallId: id, toolName, input: json },
    { type: "finish", finishReason: { unified: "tool-calls", raw: undefined }, usage: STUB_USAGE }
  ];
}

function textParts(text: string): StreamPart[] {
  const id = "text_1";

  return [
    { type: "stream-start", warnings: [] },
    { type: "text-start", id },
    { type: "text-delta", id, delta: text },
    { type: "text-end", id },
    { type: "finish", finishReason: { unified: "stop", raw: undefined }, usage: STUB_USAGE }
  ];
}

function toStream(parts: StreamPart[]): ReadableStream<StreamPart> {
  return new ReadableStream({
    start(controller) {
      for (const part of parts) {
        controller.enqueue(part);
      }

      controller.close();
    }
  });
}

// Collects every tool result the AI SDK put into the prompt, in order.
function toolResults(prompt: StreamOptions["prompt"]): PromptToolResult[] {
  const found: PromptToolResult[] = [];

  for (const message of prompt) {
    if (message.role !== "tool") {
      continue;
    }

    for (const part of message.content) {
      if (part.type !== "tool-result") {
        continue;
      }

      found.push({ toolName: part.toolName, output: part.output as PromptToolResult["output"] });
    }
  }

  return found;
}

function outputValue(result: PromptToolResult): unknown {
  if (result.output.type === OutputType.Json) {
    return result.output.value;
  }

  if (result.output.type === OutputType.Text) {
    return parseJson(String(result.output.value));
  }

  return null;
}

// The code tool returns { result, logs? }; the program puts its plan at result.plan.
function planFromResult(result: PromptToolResult): unknown {
  const value = outputValue(result) as { result?: { plan?: unknown } } | null;
  return value?.result?.plan ?? null;
}

function describeApply(result: PromptToolResult): string {
  if (result.output.type === OutputType.ExecutionDenied) {
    return "The plan was rejected. Nothing was written to GitHub.";
  }

  if (result.output.type.startsWith(ERROR_OUTPUT_PREFIX)) {
    return `Applying the plan failed: ${stringify(result.output.value)}`;
  }

  return `Applied the approved plan: ${stringify(outputValue(result))}`;
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function stringify(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value);
}
