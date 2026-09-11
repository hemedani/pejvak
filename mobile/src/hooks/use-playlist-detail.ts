import { useCallback, useEffect, useState } from "react";

import { PlaylistService, type PlaylistDetailData } from "@/services/PlaylistService";

export type UsePlaylistDetailResult = {
  data: PlaylistDetailData | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

type Loaded = { id: string; data: PlaylistDetailData | null };

/** Loads a playlist with its resolved tracks; keyed by id to avoid stale flashes. */
export function usePlaylistDetail(
  playlistId: string | null | undefined,
): UsePlaylistDetailResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!playlistId) {
      return;
    }
    let cancelled = false;
    void PlaylistService.loadDetail(playlistId).then((data) => {
      if (!cancelled) {
        setLoaded({ id: playlistId, data });
        setPending(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [playlistId]);

  const refresh = useCallback(async () => {
    if (!playlistId) {
      setLoaded(null);
      setPending(false);
      return;
    }
    setLoaded({ id: playlistId, data: await PlaylistService.loadDetail(playlistId) });
    setPending(false);
  }, [playlistId]);

  const data = loaded && loaded.id === playlistId ? loaded.data : null;
  const loading = playlistId ? pending && data === null : false;

  return { data, loading, refresh };
}
