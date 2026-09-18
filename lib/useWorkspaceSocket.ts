"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import type { ConnectionState, WorkspaceEvent } from "./types";
import { startMockFeed } from "./mockEvents";

const MAX_EVENTS = 500;
const MAX_BACKOFF_MS = 10_000;

export function useWorkspaceSocket(workspaceId: string) {
  const [events, setEvents] = useState<WorkspaceEvent[]>([]);
  const [connectionState, setConnectionState] = useState<ConnectionState>("connecting");
  const socketRef = useRef<WebSocket | null>(null);
  const attemptRef = useRef(0);
  const cleanupMockRef = useRef<(() => void) | null>(null);

  const handleEvent = useCallback((event: WorkspaceEvent) => {
    setEvents((prev) => {
      const next = [...prev, event];
      return next.length > MAX_EVENTS ? next.slice(next.length - MAX_EVENTS) : next;
    });
  }, []);

  useEffect(() => {
    const useMock = process.env.NEXT_PUBLIC_MOCK === "1";
    const wsUrl = process.env.NEXT_PUBLIC_WORKSPACE_WS_URL;

    if (useMock || !wsUrl) {
      cleanupMockRef.current = startMockFeed(handleEvent, setConnectionState);
      return () => cleanupMockRef.current?.();
    }

    let cancelled = false;

    const connect = () => {
      if (cancelled) return;
      setConnectionState(attemptRef.current === 0 ? "connecting" : "reconnecting");
      const socket = new WebSocket(`${wsUrl}/${workspaceId}`);
      socketRef.current = socket;

      socket.onopen = () => {
        attemptRef.current = 0;
        setConnectionState("connected");
      };

      socket.onmessage = (message) => {
        try {
          const parsed = JSON.parse(message.data) as WorkspaceEvent;
          handleEvent(parsed);
        } catch {
          // Malformed frame from the backend — surfaced in dev tools, not the UI,
          // so one bad event never breaks the whole feed.
          console.warn("Received a non-JSON or malformed workspace event", message.data);
        }
      };

      socket.onclose = () => {
        if (cancelled) return;
        setConnectionState("reconnecting");
        const delay = Math.min(1000 * 2 ** attemptRef.current, MAX_BACKOFF_MS);
        attemptRef.current += 1;
        setTimeout(connect, delay);
      };

      socket.onerror = () => {
        socket.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      socketRef.current?.close();
    };
  }, [workspaceId, handleEvent]);

  return { events, connectionState };
}
