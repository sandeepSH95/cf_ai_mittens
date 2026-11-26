/**
 * The attack tab: the same eight attack programs against two executors.
 *
 *   [Run the 8 attacks]
 *   +---------------------------+  +-------------------------------+
 *   | Mittens sandbox           |  | Naive executor (token in env) |
 *   | 0 of 8 breached           |  | 1 of 8 breached               |
 *   | one row per attack        |  | one row per attack            |
 *   +---------------------------+  +-------------------------------+
 */
import { CircleAlert, Loader2, Play } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

import { fetchBothRuns, type AttackRuns } from "./api";
import { AttackCard } from "./AttackCard";
import { ATTACK_COUNT, RunPhase } from "./constants";

const UNKNOWN_ERROR = "The attack run failed for an unknown reason.";

type AttackState = { phase: RunPhase; runs: AttackRuns | null; error: string | null };

const IDLE_STATE: AttackState = { phase: RunPhase.Idle, runs: null, error: null };

export function AttackTab() {
  const [state, setState] = useState<AttackState>(IDLE_STATE);
  const loading = state.phase === RunPhase.Loading;

  // One click runs both executors. An old report is cleared first, so a stale verdict never shows next to a new one.
  const runAll = async () => {
    setState({ phase: RunPhase.Loading, runs: null, error: null });

    try {
      const runs = await fetchBothRuns();

      setState({ phase: RunPhase.Done, runs, error: null });
    } catch (error) {
      setState({ phase: RunPhase.Failed, runs: null, error: error instanceof Error ? error.message : UNKNOWN_ERROR });
    }
  };

  return (
    <section aria-labelledby="attack-heading" className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex max-w-2xl flex-col gap-1">
          <h2 id="attack-heading" className="text-xl font-semibold tracking-tight">
            Eight attacks, two executors
          </h2>
          <p className="text-sm text-muted-foreground">
            The same eight attack programs run against two executors. The only difference: the naive executor has the API token in the isolate's env.
          </p>
        </div>

        <Button type="button" size="lg" onClick={runAll} disabled={loading} aria-busy={loading}>
          {loading ? <Loader2 aria-hidden="true" className="animate-spin" /> : <Play aria-hidden="true" />}
          {loading ? "Running the attacks" : `Run the ${ATTACK_COUNT} attacks`}
        </Button>
      </div>

      {/* Screen readers hear the phase change. The visible state is in the button and the badges. */}
      <p role="status" className="sr-only">
        {statusText(state)}
      </p>

      {state.error !== null ? (
        <div role="alert" className="flex items-start gap-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
          <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <div>
            <p className="font-medium">The attacks did not run.</p>
            <p>{state.error} Start the run again.</p>
          </div>
        </div>
      ) : null}

      {/* Side by side from 1280 px. Below that a card is too narrow for the four columns, so the cards stack. */}
      <div className="grid gap-6 xl:grid-cols-2">
        <AttackCard
          title="Mittens sandbox"
          description="No network, no token in the isolate. Reads cross the gate."
          run={state.runs?.mittens ?? null}
          phase={state.phase}
        />
        <AttackCard
          title="Naive executor (token in env)"
          description="The same isolate, with the API token in its env."
          run={state.runs?.naive ?? null}
          phase={state.phase}
        />
      </div>
    </section>
  );
}

/** Example: "Done. Mittens sandbox: 0 breached. Naive executor: 1 breached." */
function statusText(state: AttackState): string {
  if (state.phase === RunPhase.Loading) {
    return "The attacks are running.";
  }

  if (state.runs === null) {
    return "";
  }

  return `Done. Mittens sandbox: ${state.runs.mittens.breached} breached. Naive executor: ${state.runs.naive.breached} breached.`;
}
