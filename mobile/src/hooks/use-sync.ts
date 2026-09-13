import * as Network from "expo-network";
import { useEffect } from "react";
import { AppState } from "react-native";

import { retryDelayMs } from "@/lib/syncRetry";
import { syncAll } from "@/services/SyncService";

/**
 * Pushes pending local rows and pulls server state on mount, whenever the app
 * returns to the foreground, when connectivity is regained, and on a timer.
 * Consecutive failures back off exponentially. All failures are swallowed —
 * the app stays usable offline.
 */
export function useSyncLifecycle(): void {
  useEffect(() => {
    let cancelled = false;
    let running = false;
    let failures = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delayMs: number) => {
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(() => void run(), delayMs);
    };

    const run = async () => {
      if (running) {
        return;
      }
      running = true;
      try {
        const summary = await syncAll();
        failures = summary.failed === 0 ? 0 : failures + 1;
      } catch {
        failures += 1;
      } finally {
        running = false;
        if (!cancelled) {
          schedule(retryDelayMs(failures));
        }
      }
    };

    void run();

    const appStateSubscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void run();
      }
    });

    // Reconnected: push the queued rows now instead of waiting for the backoff.
    const networkSubscription = Network.addNetworkStateListener((state) => {
      if (state.isConnected && state.isInternetReachable !== false) {
        void run();
      }
    });

    return () => {
      cancelled = true;
      if (timer) {
        clearTimeout(timer);
      }
      appStateSubscription.remove();
      networkSubscription.remove();
    };
  }, []);
}
