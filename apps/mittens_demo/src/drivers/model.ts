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
export const WORKERS_AI_ALTERNATIVE_MODEL: WorkersAIModelId = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const STUB_PROVIDER = "stub";
const STUB_MODEL_ID = "stub/mittens";

/** Fixed token counts the stub reports. They exist so the ledger columns are exercised; they measure nothing. */
const STUB_USAGE = {
  inputTokens: { total: 120, noCache: 120, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 80, text: 80, reasoning: 0 }
};

export interface ModelDriver {
  readonly kind: ModelDriverKind;
  readonly modelId: string;
  model(): LanguageModel;
}

/** Real implementation. Needs the AI binding, which needs `wrangler login`. */
export class WorkersAiModelDriver implements ModelDriver {
  readonly kind = ModelDriverKind.WorkersAi;
  readonly modelId: WorkersAIModelId;
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
