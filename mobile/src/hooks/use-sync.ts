import { useEffect } from "react";
import { AppState } from "react-native";

import { syncPending } from "@/services/SyncService";

/**
 * Syncs on mount and whenever the app returns to the foreground. Failures are
 * swallowed — sync is best-effort and the rows stay queued.
 */
export function useSyncLifecycle(): void {
  useEffect(() => {
    void syncPending().catch(() => undefined);

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void syncPending().catch(() => undefined);
      }
    });

    return () => subscription.remove();
  }, []);
}
