/**
 * The demo page: two tabs.
 *
 *   Mittens
 *   [ Attack ] [ Chat ]
 *   +--------------------------------------------------------------+
 *   | Attack (default): eight attacks against two executors        |
 *   | Chat: the agent, its tool calls and the ledger row           |
 *   +--------------------------------------------------------------+
 *
 * Only the open tab is mounted. So the chat opens its connection to the
 * agent when a person opens the Chat tab, and the attack tab needs no agent.
 * The chat's code is a separate chunk that loads on the first open of that
 * tab: the attack tab, the default, does not pay for the agent libraries.
 */
import { Loader2, MessageSquare, ShieldCheck } from "lucide-react";
import { lazy, Suspense } from "react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AttackTab } from "./attack/AttackTab";

const ChatTab = lazy(async () => ({ default: (await import("./chat/ChatTab")).ChatTab }));

const PageTab = {
  Attack: "attack",
  Chat: "chat"
} as const;

export function App() {
  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-6 p-4 sm:p-6 lg:p-8">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Mittens</h1>
        <p className="text-sm text-muted-foreground">Mittens for AI agents: read anything, touch nothing, ask before you write.</p>
      </header>

      <Tabs defaultValue={PageTab.Attack} className="gap-6">
        <TabsList>
          <TabsTrigger value={PageTab.Attack}>
            <ShieldCheck aria-hidden="true" />
            Attack
          </TabsTrigger>
          <TabsTrigger value={PageTab.Chat}>
            <MessageSquare aria-hidden="true" />
            Chat
          </TabsTrigger>
        </TabsList>

        <TabsContent value={PageTab.Attack}>
          <AttackTab />
        </TabsContent>

        <TabsContent value={PageTab.Chat}>
          <Suspense fallback={<ChatLoading />}>
            <ChatTab />
          </Suspense>
        </TabsContent>
      </Tabs>
    </main>
  );
}

function ChatLoading() {
  return (
    <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
      <Loader2 aria-hidden="true" className="size-4 animate-spin" />
      Loading the chat
    </p>
  );
}
