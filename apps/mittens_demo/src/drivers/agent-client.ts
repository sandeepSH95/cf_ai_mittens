/**
 * A client of one CoderAgent instance, for tests. It speaks the same wire
 * protocol as the page (useAgentChat), so the agent cannot tell the two apart.
 *
 *   AgentClient --WebSocket--> Worker fetch --routeAgentRequest--> CoderAgent "<name>"
 *     say("Close my stale PRs")     cf_agent_use_chat_request    -->  one turn
 *     answer(toolCallId, approved)  cf_agent_tool_approval       -->  the rest of the turn
 *     messages()                    GET .../get-messages         -->  the stored chat
 *     ledger()                      GET .../ledger               -->  { state, ledger }
 *
 * The raw frames stay in this file. Callers work with turns and messages.
 */

/** The Worker's own fetch handler. Example: `exports.default` from "cloudflare:workers". */
export type WorkerFetcher = { fetch(request: Request): Promise<Response> };

/** One part of a stored chat message. Only the fields a tool part carries are named. */
export type ChatPart = { type: string; state?: string; toolCallId?: string; output?: unknown; errorText?: string };
export type ChatMessage = { id: string; role: string; parts: ChatPart[] };

const ORIGIN = "http://mittens.test";
const AGENT_ROUTE = "/agents/coder-agent";
const MESSAGES_ROUTE = "get-messages";
const LEDGER_ROUTE = "ledger";
const HTTP_SWITCHING_PROTOCOLS = 101;
const NORMAL_CLOSURE = 1000;

/** The wire types of the chat protocol (package agents, chat/protocol). */
const Wire = {
  ChatRequest: "cf_agent_use_chat_request",
  ChatResponse: "cf_agent_use_chat_response",
  ToolApproval: "cf_agent_tool_approval"
} as const;

type ResponseFrame = { type: string; done?: boolean };

export class AgentClient {
  readonly #worker: WorkerFetcher;
  readonly #name: string;
  readonly #socket: WebSocket;

  // Settled by the next frame that ends a response. One turn waits at a time.
  #turnEnded: (() => void) | null = null;

  private constructor(worker: WorkerFetcher, name: string, socket: WebSocket) {
    this.#worker = worker;
    this.#name = name;
    this.#socket = socket;

    socket.addEventListener("message", (event) => this.#onFrame(event.data));
  }

  /** Example: await AgentClient.connect(exports.default, "verify-G-028"). */
  static async connect(worker: WorkerFetcher, name: string): Promise<AgentClient> {
    const request = new Request(agentUrl(name), { headers: { Upgrade: "websocket" } });
    const response = await worker.fetch(request);
    const socket = response.webSocket;

    if (response.status !== HTTP_SWITCHING_PROTOCOLS || socket === null) {
      throw new Error(`Agent "${name}" refused the WebSocket with HTTP ${response.status}`);
    }

    socket.accept();

    return new AgentClient(worker, name, socket);
  }

  /** Sends one user message and resolves when the agent's response has ended. */
  say(text: string): Promise<void> {
    const message = { id: crypto.randomUUID(), role: "user", parts: [{ type: "text", text }] };
    const init = { method: "POST", body: JSON.stringify({ messages: [message] }) };

    return this.#sendAndWait({ type: Wire.ChatRequest, id: crypto.randomUUID(), init });
  }

  /** Answers a pending approval as the human would, and resolves when the rest of the turn has ended. */
  answer(toolCallId: string, approved: boolean): Promise<void> {
    return this.#sendAndWait({ type: Wire.ToolApproval, toolCallId, approved, autoContinue: true });
  }

  /** The chat as the agent stored it. */
  async messages(): Promise<ChatMessage[]> {
    return (await this.#get(MESSAGES_ROUTE)) as ChatMessage[];
  }

  /** The body of the agent's ledger route: its state and its last ledger rows. */
  async ledger(): Promise<unknown> {
    return this.#get(LEDGER_ROUTE);
  }

  close(): void {
    this.#socket.close(NORMAL_CLOSURE);
  }

  #sendAndWait(frame: Record<string, unknown>): Promise<void> {
    const ended = new Promise<void>((resolve) => {
      this.#turnEnded = resolve;
    });

    this.#socket.send(JSON.stringify(frame));

    return ended;
  }

  #onFrame(data: unknown): void {
    if (typeof data !== "string") {
      return;
    }

    const frame = parseFrame(data);

    if (frame?.type !== Wire.ChatResponse || frame.done !== true) {
      return;
    }

    this.#turnEnded?.();
    this.#turnEnded = null;
  }

  async #get(route: string): Promise<unknown> {
    const response = await this.#worker.fetch(new Request(`${agentUrl(this.#name)}/${route}`));

    if (!response.ok) {
      throw new Error(`Agent "${this.#name}" answered GET ${route} with HTTP ${response.status}`);
    }

    return response.json();
  }
}

function agentUrl(name: string): string {
  return `${ORIGIN}${AGENT_ROUTE}/${encodeURIComponent(name)}`;
}

// The agent also sends frames that are not JSON objects of the chat protocol. Those are not ours.
function parseFrame(data: string): ResponseFrame | null {
  try {
    return JSON.parse(data) as ResponseFrame;
  } catch {
    return null;
  }
}
