/**
 * What a browser client can reach on the agent.
 *
 *   browser --WebSocket--> { type: "rpc", method: "countGateCall" } --> CoderAgent
 *                                                                          |
 *                          { success: false, "... is not callable" } <-----+
 *
 * CoderAgent.countGateCall is public because the gate calls it over Durable
 * Object RPC, on the host. A client must not reach it: a client that could
 * would write its own numbers into the ledger. The agents SDK lets a client
 * call only a method marked with @callable. These tests send the real client
 * frames and read the real answers, so a change of the SDK or a stray
 * @callable shows up here.
 */
import { exports } from "cloudflare:workers";
import { describe, expect, it } from "vitest";
import { CoderAgent } from "../src/server";

const ORIGIN = "http://mittens.test";
const AGENT_ROUTE = "/agents/coder-agent";
const HTTP_SWITCHING_PROTOCOLS = 101;
const HTTP_OK = 200;
const RPC_TYPE = "rpc";
const GATE_COUNT_METHOD = "countGateCall";
const MISSING_METHOD = "noSuchMethod";
const FORGED_RUN_ID = "forged-run";
const CONSTRUCTOR = "constructor";

type WorkerFetcher = { fetch(request: Request): Promise<Response> };
type RpcAnswer = { type: string; id: string; success: boolean; error?: string; result?: unknown };

const worker = exports.default as unknown as WorkerFetcher;

function agentUrl(name: string): string {
  return `${ORIGIN}${AGENT_ROUTE}/${encodeURIComponent(name)}`;
}

/** Opens the same WebSocket the page opens. */
async function connect(name: string): Promise<WebSocket> {
  const response = await worker.fetch(new Request(agentUrl(name), { headers: { Upgrade: "websocket" } }));
  const socket = response.webSocket;

  if (response.status !== HTTP_SWITCHING_PROTOCOLS || socket === null) {
    throw new Error(`the agent refused the WebSocket with HTTP ${response.status}`);
  }

  socket.accept();

  return socket;
}

/** Sends one client RPC frame and resolves with the agent's answer to it. */
function callAsClient(socket: WebSocket, method: string, args: unknown[]): Promise<RpcAnswer> {
  const id = crypto.randomUUID();

  return new Promise((resolve) => {
    const onMessage = (event: MessageEvent): void => {
      const answer = parseAnswer(event.data);

      if (answer?.type !== RPC_TYPE || answer.id !== id) {
        return;
      }

      socket.removeEventListener("message", onMessage);
      resolve(answer);
    };

    socket.addEventListener("message", onMessage);
    socket.send(JSON.stringify({ type: RPC_TYPE, id, method, args }));
  });
}

// The agent also sends state frames that are not answers to an RPC.
function parseAnswer(data: unknown): RpcAnswer | null {
  try {
    return JSON.parse(String(data)) as RpcAnswer;
  } catch {
    return null;
  }
}

/** Every method the agent class itself defines. Example: ["onChatMessage", "countGateCall", "onRequest"]. */
function ownMethods(): string[] {
  const prototype = CoderAgent.prototype as unknown as Record<string, unknown>;

  return Object.getOwnPropertyNames(prototype).filter((name) => name !== CONSTRUCTOR && typeof prototype[name] === "function");
}

describe("what a browser client can reach", () => {
  it("refuses a client call of countGateCall", async () => {
    const socket = await connect("client-reach-count");

    const answer = await callAsClient(socket, GATE_COUNT_METHOD, [FORGED_RUN_ID]);

    expect(answer.success).toBe(false);
    expect(answer.error).toBe(`Method ${GATE_COUNT_METHOD} is not callable`);
  });

  // The control: the frame reaches the RPC dispatcher, and "not callable" is not the answer to everything.
  it("answers a missing method with another error", async () => {
    const socket = await connect("client-reach-missing");

    const answer = await callAsClient(socket, MISSING_METHOD, []);

    expect(answer.success).toBe(false);
    expect(answer.error).toBe(`Method ${MISSING_METHOD} does not exist`);
  });

  // A tripwire: a new @callable on the agent is a decision for a human, not a side effect.
  it("lets a client call no method of the agent class", async () => {
    const socket = await connect("client-reach-sweep");
    const methods = ownMethods();

    expect(methods).toContain(GATE_COUNT_METHOD);

    for (const method of methods) {
      const answer = await callAsClient(socket, method, []);

      expect(answer.success, method).toBe(false);
      expect(answer.error, method).toBe(`Method ${method} is not callable`);
    }
  });

  it("does not run countGateCall for an HTTP request", async () => {
    for (const method of ["GET", "POST"]) {
      const response = await worker.fetch(new Request(`${agentUrl("client-reach-http")}/${GATE_COUNT_METHOD}`, { method }));

      expect(response.status, method).not.toBe(HTTP_OK);
    }
  });
});
