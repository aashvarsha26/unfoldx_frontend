import type { WorkspaceEvent } from "./types";

/**
 * Turns a raw payload into one plain-language line. Falls back to a
 * compact JSON preview for event types this hasn't been taught yet,
 * so an unrecognized backend payload still renders instead of breaking.
 */
export function summarize(event: WorkspaceEvent): string {
  const p = event.payload as Record<string, any>;
  switch (event.event_type) {
    case "provider_connected":
      return p.detail ?? `${p.provider ?? event.provider} connected`;
    case "task_submitted":
      return p.summary ?? "Task submitted";
    case "plan_decomposed":
      return Array.isArray(p.subtasks)
        ? `Decomposed into ${p.subtasks.length} subtask(s): ${p.subtasks.join(", ")}`
        : "Task decomposed";
    case "route_decided":
      return p.reason ? `Routed to ${p.agent ?? event.provider} — ${p.reason}` : "Route decided";
    case "conflict_checked":
      return "Checked for conflicts with in-flight work — none found";
    case "conflict_detected":
      return p.detail ?? "Conflict detected against another in-flight subtask";
    case "dispatch_started":
      return p.command ? `Dispatched: ${p.command}` : "Dispatch started";
    case "log_line":
      return p.line ?? "…";
    case "budget_update":
      return `Spend updated — $${(p.spent_usd ?? 0).toFixed(3)} of $${(p.cap_usd ?? 0).toFixed(2)}`;
    case "circuit_breaker_triggered":
      return "Budget cap reached — dispatch paused";
    case "handoff_emitted": {
      const decisions = Array.isArray(p.decisions) ? p.decisions.length : 0;
      const files = Array.isArray(p.files_touched) ? p.files_touched.length : 0;
      return `Handoff recorded — ${decisions} decision(s), ${files} file(s) touched`;
    }
    case "authorization_denied":
      return p.detail ?? "Action blocked by workspace role";
    case "task_completed":
      return p.summary ?? "Task completed";
    case "error":
      return p.message ?? "Error";
    default:
      return JSON.stringify(p);
  }
}
