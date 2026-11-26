import { Loader2, Wifi, WifiOff } from "lucide-react";

import { Badge } from "@/components/ui/badge";

import { Connection } from "./constants";

const LABELS: Record<Connection, string> = {
  [Connection.Connecting]: "Connecting",
  [Connection.Connected]: "Connected",
  [Connection.Failed]: "Not connected"
};

/**
 * Shows the state of the connection to the agent. Without it, a reconnect
 * (for example after a restart of the server) is silent and a sent message
 * looks lost. Example: <ConnectionBadge connection={Connection.Connecting} />.
 */
export function ConnectionBadge({ connection }: { connection: Connection }) {
  if (connection === Connection.Connected) {
    return (
      <Badge variant="success" role="status">
        <Wifi aria-hidden="true" />
        {LABELS[connection]}
      </Badge>
    );
  }

  if (connection === Connection.Failed) {
    return (
      <Badge variant="destructive" role="status">
        <WifiOff aria-hidden="true" />
        {LABELS[connection]}
      </Badge>
    );
  }

  return (
    <Badge variant="outline" role="status">
      <Loader2 aria-hidden="true" className="animate-spin" />
      {LABELS[connection]}
    </Badge>
  );
}
