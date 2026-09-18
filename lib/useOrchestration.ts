"use client";

import { useCallback, useState } from "react";
import type { Provider } from "./types";
import {
  AGENT_PROVIDERS,
  LAYOUT,
  PROVIDER_LABEL,
  emptyOverrides,
  routeTask,
  type FileDraft,
  type HubOverrides,
} from "./graph";

/**
 * The control actions a person can take from the canvas, matching the
 * architecture doc's step 9 ("Authorization checks"): prompt an agent,
 * redirect, stop, approve a budget override, wire agents together, or
 * create a task for Bob to route.
 */
export type ControlAction =
  | { kind: "pause"; provider: Provider }
  | { kind: "resume"; provider: Provider }
  | { kind: "stop"; provider: Provider }
  | { kind: "approve_budget"; provider: Provider }
  | { kind: "redirect"; subtaskId: string; target: Provider }
  | { kind: "submit_task"; summary: string; files?: FileDraft[] }
  | { kind: "prompt_agent"; agentId: string; text: string }
  | { kind: "add_agent"; provider: Provider }
  | { kind: "remove_agent"; agentId: string }
  | { kind: "clear_added_agents" }
  | { kind: "connect"; source: string; target: string }
  | { kind: "disconnect"; connectionId: string }
  | { kind: "attach"; agentId: string; files: FileDraft[] }
  | { kind: "detach"; attachmentId: string };

export interface QueuedAction {
  id: string;
  at: string;
  action: ControlAction;
  label: string;
}

function actionLabel(action: ControlAction): string {
  switch (action.kind) {
    case "pause":
      return `Pause ${PROVIDER_LABEL[action.provider]}`;
    case "resume":
      return `Resume ${PROVIDER_LABEL[action.provider]}`;
    case "stop":
      return `Stop ${PROVIDER_LABEL[action.provider]}`;
    case "approve_budget":
      return `Approve budget override for ${PROVIDER_LABEL[action.provider]}`;
    case "redirect":
      return `Redirect ${action.subtaskId} → ${PROVIDER_LABEL[action.target]}`;
    case "submit_task":
      return action.files && action.files.length > 0
        ? `Command: ${action.summary} (+${action.files.length} file${action.files.length === 1 ? "" : "s"})`
        : `Command: ${action.summary}`;
    case "prompt_agent":
      return `Prompt an agent: ${action.text}`;
    case "add_agent":
      return `Add ${PROVIDER_LABEL[action.provider]} agent`;
    case "remove_agent":
      return `Remove agent ${action.agentId}`;
    case "clear_added_agents":
      return "Clear all added agents";
    case "connect":
      return `Connect ${action.source} → ${action.target}`;
    case "disconnect":
      return `Disconnect ${action.connectionId}`;
    case "attach":
      return `Attach ${action.files.length} file${action.files.length === 1 ? "" : "s"} to ${action.agentId}`;
    case "detach":
      return `Detach file ${action.attachmentId.slice(0, 8)}`;
  }
}

function applyLocal(prev: HubOverrides, action: ControlAction): HubOverrides {
  const next: HubOverrides = {
    paused: new Set(prev.paused),
    stopped: new Set(prev.stopped),
    approved: new Set(prev.approved),
    redirected: new Map(prev.redirected),
    submitted: [...prev.submitted],
    addedAgents: [...prev.addedAgents],
    connections: [...prev.connections],
    prompts: [...prev.prompts],
    attachments: [...prev.attachments],
  };

  switch (action.kind) {
    case "pause":
      next.paused.add(action.provider);
      next.stopped.delete(action.provider);
      break;
    case "resume":
      next.paused.delete(action.provider);
      next.stopped.delete(action.provider);
      break;
    case "stop":
      next.stopped.add(action.provider);
      break;
    case "approve_budget":
      next.approved.add(action.provider);
      break;
    case "redirect":
      next.redirected.set(action.subtaskId, action.target);
      break;
    case "submit_task": {
      const route = routeTask(action.summary);
      const files =
        action.files && action.files.length > 0
          ? action.files.map((f) => ({ ...f, agentId: null as string | null, at: new Date().toISOString() }))
          : [];
      next.submitted = [
        ...next.submitted,
        { id: `local-${crypto.randomUUID().slice(0, 8)}`, summary: action.summary, provider: route.provider, reason: route.reason, files },
      ];
      if (files.length > 0) {
        const consumed = new Set(files.map((f) => f.id));
        next.attachments = next.attachments.filter((a) => !consumed.has(a.id));
      }
      break;
    }
    case "prompt_agent":
      next.prompts = [
        ...next.prompts,
        {
          id: crypto.randomUUID(),
          agentId: action.agentId,
          text: action.text,
          at: new Date().toISOString(),
          status: "queued",
        },
      ];
      break;
    case "add_agent": {
      const sameType = prev.addedAgents.filter((a) => a.provider === action.provider).length;
      const index = prev.addedAgents.length;
      next.addedAgents = [
        ...next.addedAgents,
        {
          id: `agent-${crypto.randomUUID().slice(0, 8)}`,
          provider: action.provider,
          label:
            sameType === 0
              ? `${PROVIDER_LABEL[action.provider]} (added)`
              : `${PROVIDER_LABEL[action.provider]} #${sameType + 1}`,
          x: LAYOUT.agentX,
          y: (AGENT_PROVIDERS.length + index) * LAYOUT.agentGap,
        },
      ];
      break;
    }
    case "remove_agent": {
      next.addedAgents = next.addedAgents.filter((a) => a.id !== action.agentId);
      next.connections = next.connections.filter(
        (c) => c.source !== action.agentId && c.target !== action.agentId
      );
      next.prompts = next.prompts.filter((p) => p.agentId !== action.agentId);
      break;
    }
    case "clear_added_agents": {
      const removed = new Set(next.addedAgents.map((a) => a.id));
      next.addedAgents = [];
      next.connections = next.connections.filter(
        (c) => !removed.has(c.source) && !removed.has(c.target)
      );
      next.prompts = next.prompts.filter((p) => !removed.has(p.agentId));
      next.attachments = next.attachments.filter((a) => a.agentId && !removed.has(a.agentId));
      break;
    }
    case "connect": {
      if (action.source === action.target) break;
      const exists = next.connections.some(
        (c) => c.source === action.source && c.target === action.target
      );
      if (exists) break;
      next.connections = [
        ...next.connections,
        { id: `conn-${crypto.randomUUID().slice(0, 8)}`, source: action.source, target: action.target },
      ];
      break;
    }
    case "disconnect":
      next.connections = next.connections.filter((c) => c.id !== action.connectionId);
      break;
    case "attach":
      next.attachments = [
        ...next.attachments,
        ...action.files.map((f) => ({
          ...f,
          agentId: action.agentId,
          at: new Date().toISOString(),
        })),
      ];
      break;
    case "detach":
      next.attachments = next.attachments.filter((a) => a.id !== action.attachmentId);
      break;
  }

  return next;
}

export function useOrchestration(workspaceId: string) {
  const [overrides, setOverrides] = useState<HubOverrides>(() => emptyOverrides());
  const [queue, setQueue] = useState<QueuedAction[]>([]);

  const send = useCallback(
    (action: ControlAction) => {
      setOverrides((prev) => applyLocal(prev, action));
      setQueue((prev) => [
        ...prev.slice(-19),
        { id: crypto.randomUUID(), at: new Date().toISOString(), action, label: actionLabel(action) },
      ]);

      // TODO(backend): replace the optimistic local update above with the real
      // REST call. Per architecture step 9, the server re-checks the caller's
      // in-workspace role before the action reaches the runtime layer, so this
      // UI must not treat the override as confirmed.
      //   await fetch(`${API_URL}/workspaces/${workspaceId}/actions`, {
      //     method: "POST",
      //     headers: { "content-type": "application/json" },
      //     body: JSON.stringify(action),
      //   });
      void workspaceId;
    },
    [workspaceId]
  );

  return { overrides, queue, send };
}
