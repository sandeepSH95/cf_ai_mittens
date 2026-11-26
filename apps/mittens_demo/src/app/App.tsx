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
 */
import { MessageSquare, ShieldCheck } from "lucide-react";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

import { AttackTab } from "./attack/AttackTab";
import { ChatTab } from "./chat/ChatTab";

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
          <ChatTab />
        </TabsContent>
      </Tabs>
    </main>
  );
}
