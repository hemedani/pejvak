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
  contextPlays: 0,
  onlineCollections: 0,
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

  /**
   * Every table that can hold an unsynced row.
   *
   * `onlineCollections` belongs here: a saved online collection is a fifth payload
   * in the `syncLocalData` batch and it is the one table that was left out, so a
   * device with three unsynced collections reported a queue of zero — and a
   * settings screen that trusts this number would say "Everything synced" over
   * work still queued. The list is derived from `PendingCounts` so a new syncable
   * table cannot be forgotten here: a key that is missing is a type error, not a
   * quiet zero.
   */
  const pendingTotal = Object.values(pending).reduce((total, count) => total + count, 0);

  return { pending, pendingTotal, lastSyncAt, syncing, refresh, syncNow };
}
