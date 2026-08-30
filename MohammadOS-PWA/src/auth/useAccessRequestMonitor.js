import { useCallback, useEffect, useRef, useState } from "react";
import { AccessRequestService } from "./AccessRequestService";
import { supabase } from "./supabaseClient";

const POLL_INTERVAL_MS = 15_000;
const SEEN_REQUESTS_STORAGE_KEY = "mohammados_seen_access_request_ids";

function readSeenRequestIds() {
  try {
    const stored = JSON.parse(localStorage.getItem(SEEN_REQUESTS_STORAGE_KEY) || "[]");
    return new Set(Array.isArray(stored) ? stored : []);
  } catch {
    return new Set();
  }
}

function writeSeenRequestIds(ids) {
  try {
    localStorage.setItem(
      SEEN_REQUESTS_STORAGE_KEY,
      JSON.stringify([...ids].slice(-200))
    );
  } catch {
    // Notifications must not break the account panel if storage is unavailable.
  }
}

export function useAccessRequestMonitor({ enabled = true, onNewRequest } = {}) {
  const [requests, setRequests] = useState([]);
  const [error, setError] = useState(null);
  const [realtimeStatus, setRealtimeStatus] = useState(() => (
    !enabled ? "disabled" : supabase ? "connecting" : "fallback"
  ));
  const seenIdsRef = useRef(readSeenRequestIds());
  const onNewRequestRef = useRef(onNewRequest);

  useEffect(() => {
    onNewRequestRef.current = onNewRequest;
  }, [onNewRequest]);

  const refresh = useCallback(async () => {
    if (!enabled) return { requests: [], error: null };

    const result = await AccessRequestService.getPending();
    if (result.error) {
      setError(result.error);
      return result;
    }

    const nextRequests = result.requests || [];
    const newRequests = nextRequests.filter((request) => !seenIdsRef.current.has(request.id));

    nextRequests.forEach((request) => seenIdsRef.current.add(request.id));
    writeSeenRequestIds(seenIdsRef.current);
    setRequests(nextRequests);
    setError(null);
    newRequests.forEach((request) => onNewRequestRef.current?.(request));
    return result;
  }, [enabled]);

  const removeRequest = useCallback((requestId) => {
    setRequests((current) => current.filter((request) => request.id !== requestId));
  }, []);

  useEffect(() => {
    if (!enabled) {
      return undefined;
    }

    const initialRefreshTimer = window.setTimeout(() => void refresh(), 0);
    const pollTimer = window.setInterval(() => void refresh(), POLL_INTERVAL_MS);
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    let channel;
    if (supabase) {
      channel = supabase
        .channel("access-request-monitor")
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "access_requests", filter: "status=eq.pending" },
          (payload) => {
            const request = payload.new;
            if (!request?.id || seenIdsRef.current.has(request.id)) return;
            seenIdsRef.current.add(request.id);
            writeSeenRequestIds(seenIdsRef.current);
            setRequests((current) => [request, ...current.filter((item) => item.id !== request.id)]);
            onNewRequestRef.current?.(request);
          }
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") setRealtimeStatus("connected");
          if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) setRealtimeStatus("fallback");
        });
    }

    return () => {
      window.clearTimeout(initialRefreshTimer);
      window.clearInterval(pollTimer);
      document.removeEventListener("visibilitychange", handleVisibility);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [enabled, refresh]);

  return { requests, error, realtimeStatus, refresh, removeRequest };
}
