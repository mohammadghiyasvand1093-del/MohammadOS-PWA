import { useEffect, useRef } from "react";
import { RecordSyncService } from "./RecordSyncService";

const RETRY_INTERVAL_MS = 60_000;

function getRetryDelay(retryAt) {
  const retryAtMs = retryAt ? new Date(retryAt).getTime() : 0;
  if (!Number.isFinite(retryAtMs)) return RETRY_INTERVAL_MS;
  return Math.max(1_000, Math.min(RETRY_INTERVAL_MS, retryAtMs - Date.now()));
}

export function useRecordAutoSync({ userId, isOnline, onResult } = {}) {
  const onResultRef = useRef(onResult);

  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  useEffect(() => {
    if (!userId) return undefined;

    let disposed = false;
    let inFlight = false;
    let retryTimer = null;

    const schedule = (delay = RETRY_INTERVAL_MS) => {
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        void run();
      }, delay);
    };

    const run = async () => {
      if (disposed || !isOnline || inFlight) return;
      inFlight = true;
      try {
        const remoteStatus = await RecordSyncService.getRemoteStatus(userId);
        if (
          remoteStatus.status === "unavailable"
          || remoteStatus.status === "offline"
          || remoteStatus.status === "unauthenticated"
          || !remoteStatus.seeded
        ) {
          return;
        }

        const result = await RecordSyncService.pushPending(userId);
        if (disposed) return;
        if (result.status === "synced" || result.status === "conflict" || result.status === "failed") {
          onResultRef.current?.(result);
        }

        if (result.status === "failed" && result.retryAt) {
          schedule(getRetryDelay(result.retryAt));
        } else if (result.status === "synced" && result.remaining > 0) {
          schedule(1_000);
        }
      } catch (error) {
        if (!disposed) {
          onResultRef.current?.({ status: "failed", error });
          schedule(RETRY_INTERVAL_MS);
        }
      } finally {
        inFlight = false;
      }
    };

    const handleOnline = () => void run();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void run();
    };
    const handleMutationEnqueued = () => void run();

    window.addEventListener("online", handleOnline);
    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("mohammados:record-mutation-enqueued", handleMutationEnqueued);
    const interval = window.setInterval(() => void run(), RETRY_INTERVAL_MS);
    void run();

    return () => {
      disposed = true;
      window.clearInterval(interval);
      window.clearTimeout(retryTimer);
      window.removeEventListener("online", handleOnline);
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("mohammados:record-mutation-enqueued", handleMutationEnqueued);
    };
  }, [isOnline, userId]);
}
