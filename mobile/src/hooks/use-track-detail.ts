import { useCallback, useEffect, useState } from "react";

import type { TrackDetailData } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";

export type UseTrackDetailResult = {
  data: TrackDetailData | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

type Loaded = { id: string; data: TrackDetailData | null };

/**
 * Loads a track's local detail (sessions + annotations). Keyed by track id so a
 * previous track's data never flashes while the next one loads.
 */
export function useTrackDetail(
  trackId: string | null | undefined,
): UseTrackDetailResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!trackId) {
      return;
    }
    let cancelled = false;
    void LocalDBService.getTrackDetailData(trackId).then((data) => {
      if (!cancelled) {
        setLoaded({ id: trackId, data });
        setPending(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [trackId]);

  const refresh = useCallback(async () => {
    if (!trackId) {
      setLoaded(null);
      setPending(false);
      return;
    }
    const data = await LocalDBService.getTrackDetailData(trackId);
    setLoaded({ id: trackId, data });
    setPending(false);
  }, [trackId]);

  const data = loaded && loaded.id === trackId ? loaded.data : null;
  const loading = trackId ? pending && data === null : false;

  return { data, loading, refresh };
}
