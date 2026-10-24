import { useCallback, useEffect, useState } from "react";

import type { FolderSummary, LocalTrack } from "@/lib/db/types";
import { buildRecentPlays, type RecentPlay } from "@/lib/recentPlays";
import { LocalDBService } from "@/services/LocalDBService";
import { PlaylistService } from "@/services/PlaylistService";

/**
 * How many recent sessions are examined to produce the list.
 *
 * Deliberately far larger than the list itself. Sessions belonging to one
 * collection collapse into a single row, so a long listen through one folder can
 * contribute forty sessions that all become one entry — a window the size of the
 * list would report "one recent play" for an evening's listening.
 */
const SCAN_LIMIT = 150;

export type RecentPlaysSources = {
  /** Rows the caller already read for the same refresh, shared rather than re-read. */
  tracks?: readonly LocalTrack[];
  folders?: readonly FolderSummary[];
};

export type UseRecentPlaysResult = {
  recent: RecentPlay[];
  loading: boolean;
  refresh: (sources?: RecentPlaysSources) => Promise<void>;
};

/**
 * The Library's Recent tab: what was played last, as the thing that was played.
 *
 * Read entirely from services in one pass rather than composed out of the other
 * hooks on the screen, because the three sources have to agree about the same
 * instant — a folder list from one render and a session list from another could
 * describe a folder that has just been emptied.
 */
export function useRecentPlays(limit = 12): UseRecentPlaysResult {
  const [recent, setRecent] = useState<RecentPlay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (sources: RecentPlaysSources = {}) => {
      // A caller that just read tracks and folders for the same refresh passes
      // them in; without that, this read is what keeps Recent from disagreeing
      // with the other tabs about the same instant.
      const [items, playlists, tracks, folders] = await Promise.all([
        LocalDBService.getSessionsForHistory(SCAN_LIMIT),
        PlaylistService.list(),
        sources.tracks
          ? Promise.resolve(sources.tracks)
          : LocalDBService.getAllTracks(),
        sources.folders
          ? Promise.resolve(sources.folders)
          : LocalDBService.getFolderSummaries(),
      ]);
      return buildRecentPlays({ items, folders, playlists, tracks, limit });
    },
    [limit],
  );

  useEffect(() => {
    let cancelled = false;
    void load().then((rows) => {
      if (!cancelled) {
        setRecent(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [load]);

  const refresh = useCallback(
    async (sources?: RecentPlaysSources) => {
      setRecent(await load(sources));
      setLoading(false);
    },
    [load],
  );

  return { recent, loading, refresh };
}
