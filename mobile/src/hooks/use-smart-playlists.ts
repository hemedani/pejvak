import { useCallback, useEffect, useState } from "react";

import type { SmartPlaylist } from "@/lib/smartPlaylists";
import { SmartPlaylistService } from "@/services/SmartPlaylistService";

export type UseSmartPlaylistsResult = {
  playlists: SmartPlaylist[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * All five recipes with their current picks. The Playlists tab renders only the
 * counts and taglines, but one build over one history index is cheaper than
 * re-reading the context per rule.
 */
export function useSmartPlaylists(): UseSmartPlaylistsResult {
  const [playlists, setPlaylists] = useState<SmartPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void SmartPlaylistService.listAll().then((rows) => {
      if (!cancelled) {
        setPlaylists(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setPlaylists(await SmartPlaylistService.listAll());
    setLoading(false);
  }, []);

  return { playlists, loading, refresh };
}
