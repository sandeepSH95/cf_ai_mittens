/**
 * The chat tab.
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
import { Send, Trash2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

import type { CoderState } from "../../server";
import { ConnectionBadge } from "./ConnectionBadge";
import { AGENT_NAME, Connection, DEFAULT_ROOM, EXAMPLE_PROMPT, STREAMING } from "./constants";
import { Message } from "./Message";
import { Panel } from "./Panel";

export function ChatTab() {
  const agent = useAgent<CoderState>({ agent: AGENT_NAME, name: DEFAULT_ROOM });
  const { messages, sendMessage, status, addToolApprovalResponse, clearHistory } = useAgentChat({ agent });
  const [draft, setDraft] = useState(EXAMPLE_PROMPT);
  const modelId = agent.state?.modelId ?? null;
  const connection = connectionOf(agent.identified, agent.connectionError !== null);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (draft.trim().length === 0) {
      return;
    }

    sendMessage({ text: draft });
    setDraft("");
  };

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* min-w-0 on both cards: a grid item may get narrower than its content, so a long line wraps and the page does not scroll sideways. */}
      <Card className="min-w-0 lg:col-span-2">
        <CardHeader>
          <CardTitle>
            <h2>Chat</h2>
          </CardTitle>
          <CardDescription>
            By default the demo runs with stub drivers: a scripted stub model and a fixture repository. No account needed.
            {/* The deployed demo uses a live model, so the page names the model that wrote the last program. */}
            {modelId ? ` Model of the last run: ${modelId}.` : null}
          </CardDescription>

          <CardAction className="flex items-center gap-2">
            <ConnectionBadge connection={connection} />

            <Button type="button" variant="outline" size="sm" onClick={clearHistory}>
              <Trash2 aria-hidden="true" />
              Clear
            </Button>
          </CardAction>
        </CardHeader>

        <CardContent className="flex min-h-[50vh] flex-1 flex-col gap-3 overflow-y-auto">
          {messages.length === 0 ? <p className="text-sm text-muted-foreground">No messages yet. Send the example prompt to start.</p> : null}

          {messages.map((message) => (
            <Message key={message.id} message={message} onApproval={addToolApprovalResponse} />
          ))}
        </CardContent>

        <CardFooter>
          <form onSubmit={submit} className="flex w-full gap-2">
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Ask about the repository"
              aria-label="Message to the agent"
            />
            <Button type="submit" disabled={status === STREAMING || connection !== Connection.Connected}>
              <Send aria-hidden="true" />
              Send
            </Button>
          </form>
        </CardFooter>
      </Card>

      <Panel state={agent.state} />
    </div>
  );
}

// Example: the agent named itself gives "connected". A final close gives "failed". A reconnect gives "connecting".
function connectionOf(identified: boolean, failed: boolean): Connection {
  if (failed) {
    return Connection.Failed;
  }

  return identified ? Connection.Connected : Connection.Connecting;
}
