import { useCallback, useEffect, useMemo, useState } from "react";

import { RelinkService, type MissingTrack } from "@/services/RelinkService";

export type UseMissingTracksResult = {
  missing: MissingTrack[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Tracks whose audio file is gone.
 *
 * Reads the whole set at once rather than paging: the list is at its longest
 * exactly when the user moved a whole library, which is when they most need to
 * see all of it, and the query is two round-trips regardless of size.
 */
export function useMissingTracks(): UseMissingTracksResult {
  const [loaded, setLoaded] = useState<MissingTrack[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    void RelinkService.listMissing().then((rows) => {
      if (!cancelled) {
        setLoaded(rows);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setLoaded(await RelinkService.listMissing());
  }, []);

  // Memoised so anything derived from it does not recompute on every render
  // while the first load is still in flight.
  const missing = useMemo(() => loaded ?? [], [loaded]);

  return { missing, loading: loaded === null, refresh };
}
