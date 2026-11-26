/**
 * Minimal chat page.
 *
 *   +---------------------------------+------------------------------+
 *   | messages                        | last program                 |
 *   |  user / assistant text          |  <pre>code the model wrote   |
 *   |  code tool: program + result    | ledger row for it            |
 *   |  apply_writes: Approve / Reject |  facade calls, round trips,  |
 *   | [input] [send]                  |  isolate ms, tokens          |
 *   +---------------------------------+------------------------------+
 */
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { getToolName, isToolUIPart, type DynamicToolUIPart, type ToolUIPart, type UIMessage } from "ai";
import { useState } from "react";
import type { CoderState } from "../server";

const AGENT_NAME = "coder-agent";
const DEFAULT_ROOM = "default";
const CODE_TOOL = "code";
const APPLY_TOOL = "apply_writes";
const STREAMING = "streaming";
const APPROVAL_REQUESTED = "approval-requested";
const OUTPUT_DENIED = "output-denied";
const OUTPUT_AVAILABLE = "output-available";
const OUTPUT_ERROR = "output-error";
const EXAMPLE_PROMPT = "List my open pull requests older than 30 days and draft a closing comment for each.";

export function App() {
  const agent = useAgent<CoderState>({ agent: AGENT_NAME, name: DEFAULT_ROOM });
  const { messages, sendMessage, status, addToolApprovalResponse, clearHistory } = useAgentChat({ agent });
  const [draft, setDraft] = useState(EXAMPLE_PROMPT);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (draft.trim().length === 0) {
      return;
    }

    sendMessage({ text: draft });
    setDraft("");
  };

  return (
    <main style={styles.page}>
      <section style={styles.chat}>
        <header style={styles.header}>
          <h1 style={styles.title}>Mittens</h1>
          <button type="button" onClick={clearHistory} style={styles.minor}>
            Clear
          </button>
        </header>

        <div style={styles.messages}>
          {messages.map((message) => (
            <Message key={message.id} message={message} onApproval={addToolApprovalResponse} />
          ))}
        </div>

        <form onSubmit={submit} style={styles.form}>
          <input value={draft} onChange={(event) => setDraft(event.target.value)} style={styles.input} placeholder="Ask about the repository" />
          <button type="submit" disabled={status === STREAMING} style={styles.button}>
            Send
          </button>
        </form>
      </section>

      <Panel state={agent.state} />
    </main>
  );
}

type ApprovalHandler = (response: { id: string; approved: boolean }) => void;

function Message({ message, onApproval }: { message: UIMessage; onApproval: ApprovalHandler }) {
  return (
    <article style={styles.message}>
      <strong>{message.role}</strong>
      {message.parts.map((part, index) => {
        if (part.type === "text") {
          return <p key={index}>{part.text}</p>;
        }

        if (isToolUIPart(part)) {
          return <ToolPart key={part.toolCallId} part={part} onApproval={onApproval} />;
        }

        return null;
      })}
    </article>
  );
}

function ToolPart({ part, onApproval }: { part: ToolUIPart | DynamicToolUIPart; onApproval: ApprovalHandler }) {
  const name = getToolName(part);
  const input = part.input as { code?: string; plan?: unknown } | undefined;

  return (
    <div style={styles.tool}>
      <div style={styles.toolTitle}>
        {name} <em>{part.state}</em>
      </div>

      {name === CODE_TOOL && input?.code !== undefined ? <pre style={styles.code}>{input.code}</pre> : null}
      {name === APPLY_TOOL && input?.plan !== undefined ? <pre style={styles.code}>{JSON.stringify(input.plan, null, 2)}</pre> : null}

      {part.state === APPROVAL_REQUESTED && "approval" in part ? (
        <div>
          <button type="button" onClick={() => onApproval({ id: part.approval.id, approved: true })} style={styles.button}>
            Approve
          </button>{" "}
          <button type="button" onClick={() => onApproval({ id: part.approval.id, approved: false })} style={styles.minor}>
            Reject
          </button>
        </div>
      ) : null}

      {part.state === OUTPUT_DENIED ? <p>Denied. Nothing was written.</p> : null}
      {part.state === OUTPUT_AVAILABLE ? <pre style={styles.code}>{JSON.stringify(part.output, null, 2)}</pre> : null}
      {part.state === OUTPUT_ERROR ? <pre style={styles.code}>{part.errorText}</pre> : null}
    </div>
  );
}

function Panel({ state }: { state: CoderState | undefined }) {
  const row = state?.lastLedger ?? null;

  return (
    <aside style={styles.panel}>
      <h2 style={styles.subtitle}>Last program</h2>
      <pre style={styles.code}>{state?.lastProgram ?? "(no program yet)"}</pre>

      <h2 style={styles.subtitle}>Ledger row</h2>
      {row === null ? (
        <p>(no run yet)</p>
      ) : (
        <table style={styles.table}>
          <tbody>
            <Row label="run id" value={row.id} />
            <Row label="model" value={state?.modelId ?? "?"} />
            <Row label="facade calls in one program" value={row.facadeCalls} />
            <Row label="model round trips" value={row.roundTrips} />
            <Row label="isolate start ms" value={row.isolateStartMs ?? "n/a"} />
            <Row label="duration ms" value={row.durationMs} />
            <Row label="tokens in" value={row.tokensIn ?? "pending"} />
            <Row label="tokens out" value={row.tokensOut ?? "pending"} />
            <Row label="error" value={row.error ?? "none"} />
          </tbody>
        </table>
      )}
    </aside>
  );
}

function Row({ label, value }: { label: string; value: string | number }) {
  return (
    <tr>
      <td style={styles.cell}>{label}</td>
      <td style={styles.cell}>{String(value)}</td>
    </tr>
  );
}

const styles = {
  page: { display: "flex", gap: "1rem", padding: "1rem", fontFamily: "system-ui, sans-serif", maxWidth: "1200px", margin: "0 auto" },
  chat: { flex: 2, display: "flex", flexDirection: "column" as const, minHeight: "80vh" },
  panel: { flex: 1, borderLeft: "1px solid #ddd", paddingLeft: "1rem", minWidth: "280px" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: "1.25rem", margin: 0 },
  subtitle: { fontSize: "1rem", marginBottom: "0.25rem" },
  messages: { flex: 1, overflowY: "auto" as const, display: "flex", flexDirection: "column" as const, gap: "0.5rem" },
  message: { border: "1px solid #eee", borderRadius: "6px", padding: "0.5rem" },
  tool: { background: "#f7f7f7", borderRadius: "6px", padding: "0.5rem", marginTop: "0.5rem" },
  toolTitle: { fontWeight: 600, marginBottom: "0.25rem" },
  code: { whiteSpace: "pre-wrap" as const, fontSize: "0.8rem", background: "#111", color: "#eee", padding: "0.5rem", borderRadius: "4px", overflowX: "auto" as const },
  form: { display: "flex", gap: "0.5rem", marginTop: "0.5rem" },
  input: { flex: 1, padding: "0.5rem" },
  button: { padding: "0.5rem 1rem" },
  minor: { padding: "0.25rem 0.5rem", background: "transparent", border: "1px solid #999", borderRadius: "4px" },
  table: { borderCollapse: "collapse" as const, width: "100%" },
  cell: { borderBottom: "1px solid #eee", padding: "0.25rem", fontSize: "0.85rem", verticalAlign: "top" as const }
};
