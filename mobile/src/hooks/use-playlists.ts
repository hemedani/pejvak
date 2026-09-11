import { useCallback, useEffect, useState } from "react";

import type { LocalPlaylist } from "@/lib/db/types";
import { PlaylistService } from "@/services/PlaylistService";

export type UsePlaylistsResult = {
  playlists: LocalPlaylist[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/** Local-first playlist list; reload on focus/after mutations. */
export function usePlaylists(): UsePlaylistsResult {
  const [playlists, setPlaylists] = useState<LocalPlaylist[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void PlaylistService.list().then((rows) => {
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
    setPlaylists(await PlaylistService.list());
    setLoading(false);
  }, []);

  return { playlists, loading, refresh };
}
