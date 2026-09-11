import { useCallback, useEffect, useState } from "react";

import type { PendingCounts } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import { SettingsService } from "@/services/SettingsService";
import { syncAll } from "@/services/SyncService";

const EMPTY_COUNTS: PendingCounts = {
  tracks: 0,
  sessions: 0,
  annotations: 0,
  playlists: 0,
};

export type UseSyncStatusResult = {
  pending: PendingCounts;
  pendingTotal: number;
  lastSyncAt: number | null;
  syncing: boolean;
  refresh: () => Promise<void>;
  syncNow: () => Promise<void>;
};

/** Surfaces the sync queue and last success, plus a manual "Sync Now". */
export function useSyncStatus(): UseSyncStatusResult {
  const [pending, setPending] = useState<PendingCounts>(EMPTY_COUNTS);
  const [lastSyncAt, setLastSyncAt] = useState<number | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refresh = useCallback(async () => {
    const [counts, last] = await Promise.all([
      LocalDBService.getPendingCounts(),
      SettingsService.getLastSyncAt(),
    ]);
    setPending(counts);
    setLastSyncAt(last);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      LocalDBService.getPendingCounts(),
      SettingsService.getLastSyncAt(),
    ]).then(([counts, last]) => {
      if (!cancelled) {
        setPending(counts);
        setLastSyncAt(last);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const syncNow = useCallback(async () => {
    setSyncing(true);
    try {
      await syncAll();
    } catch {
      // Swallowed: sync failures never block the UI.
    } finally {
      setSyncing(false);
      await refresh();
    }
  }, [refresh]);

  const pendingTotal =
    pending.tracks + pending.sessions + pending.annotations + pending.playlists;

  return { pending, pendingTotal, lastSyncAt, syncing, refresh, syncNow };
}
