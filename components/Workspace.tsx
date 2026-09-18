"use client";

import { useMemo } from "react";
import dynamic from "next/dynamic";
import { motion, useReducedMotion } from "motion/react";
import { useWorkspaceSocket } from "@/lib/useWorkspaceSocket";
import { buildHub } from "@/lib/graph";
import { useOrchestration } from "@/lib/useOrchestration";
import { ConnectionStatus } from "./ConnectionStatus";
import { BudgetStrip } from "./BudgetStrip";
import { EventFeed } from "./EventFeed";
import { Taskbar } from "./Taskbar";
import { LivePreview } from "./LivePreview";

// React Flow measures the DOM, so it only mounts on the client.
const HubCanvas = dynamic(() => import("./canvas/HubCanvas").then((m) => m.HubCanvas), {
  ssr: false,
  loading: () => (
    <div className="flex h-full min-h-[560px] w-full items-center justify-center rounded-md border border-ink-700 bg-ink-950 text-sm text-muted">
      Loading canvas…
    </div>
  ),
});

const WORKSPACE_ID = process.env.NEXT_PUBLIC_WORKSPACE_ID ?? "demo-workspace";

export function Workspace() {
  const { events, connectionState } = useWorkspaceSocket(WORKSPACE_ID);
  const { overrides, queue, send } = useOrchestration(WORKSPACE_ID);
  const reduceMotion = useReducedMotion();

  const hub = useMemo(() => buildHub(events, overrides), [events, overrides]);
  const ledgerAgents = useMemo(() => [hub.bob, ...hub.agents], [hub]);
  const bobConnected = events.some((e) => e.provider === "bob");
  const recentQueue = useMemo(() => [...queue].reverse().slice(0, 6), [queue]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-[1800px] flex-col gap-4 px-20 py-5 lg:px-30 lg:py-7">
      <motion.header
        className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"
        initial={reduceMotion ? false : { opacity: 0, y: -14 }}
        animate={reduceMotion ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
      >
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex flex-col items-start gap-2">
            <h1 className="text-lg font-large text-parchment">UnfoldX</h1>
            <p className="font-mono text-xs text-muted">workspace/{WORKSPACE_ID}</p>
            <div
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 text-xs ${
              bobConnected
                ? "border-ledger-gold/40 bg-ledger-gold/10 text-ledger-gold"
                : "border-ink-700 bg-ink-800 text-muted"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${bobConnected ? "bg-ledger-gold" : "bg-muted"}`} />
            {bobConnected
              ? "Bob Shell is decomposing and executing work in this workspace"
              : "Waiting on Bob Shell to connect — Bob drives task decomposition for every workspace"}
            </div>
        </div>
        </div>

        <div className="flex items-center gap-3">
          <ConnectionStatus state={connectionState} />
          <span className="hidden font-mono text-[11px] text-muted/70 sm:inline">
            {hub.agents.length} agents · {hub.subtasks.length} subtasks · {queue.length} queued
          </span>
        </div>
      </motion.header>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Budget ledger</h2>
        <BudgetStrip agents={ledgerAgents} />
      </section>

      <div className="grid flex-1 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="relative h-[72vh] min-h-[580px] overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
          <HubCanvas model={hub} onAction={send} />
          <Taskbar
            onAction={send}
            addedCount={hub.agents.filter((a) => !a.builtIn).length}
          />
        </section>

        <aside className="flex min-w-0 flex-col gap-4 pb-1">
          <LivePreview />

          <section>
            <h2 className="mb-2 text-sm font-medium text-muted">Event chain</h2>
            <EventFeed events={events} />
          </section>

          <div className="grid grid-cols-1 gap-3">
            <div className="rounded-md border border-ink-700 bg-ink-900 p-3">
              <h3 className="mb-2 text-xs font-medium text-muted">Connectors</h3>
              <p className="mb-2 text-[11px] text-muted/60">
                Drag the <span className="text-ledger-violet">⊕</span> on a node&apos;s right edge onto another
                node&apos;s left edge to wire a handoff. Select an edge and press Delete to remove it.
              </p>
              {hub.connections.length === 0 ? (
                <p className="text-[11px] text-muted/60">
                  No connections yet. Wire agents together to model handoffs.
                </p>
              ) : (
                <ul className="flex flex-col gap-1.5">
                  {hub.connections.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="truncate text-parchment/90">
                        {c.sourceLabel} <span className="text-muted">→</span> {c.targetLabel}
                      </span>
                      <button
                        type="button"
                        onClick={() => send({ kind: "disconnect", connectionId: c.id })}
                        className="shrink-0 text-[10px] text-muted hover:text-ledger-coral"
                      >
                        remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="rounded-md border border-ink-700 bg-ink-900 p-3">
              <h3 className="mb-2 text-xs font-medium text-muted">Recent controls</h3>
              {recentQueue.length === 0 ? (
                <p className="text-[11px] text-muted/60">Nothing yet — prompt an agent or route a command.</p>
              ) : (
                <ul className="flex flex-col gap-1">
                  {recentQueue.map((q) => (
                    <li key={q.id} className="flex items-center gap-2 text-[11px]">
                      <span className="font-mono text-muted/50">
                        {new Date(q.at).toLocaleTimeString(undefined, { hour12: false })}
                      </span>
                      <span className="truncate text-parchment/80">{q.label}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}