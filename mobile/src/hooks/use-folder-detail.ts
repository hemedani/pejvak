import { useCallback, useEffect, useState } from "react";

import { FolderService, type FolderDetailData } from "@/services/FolderService";

export type UseFolderDetailResult = {
  data: FolderDetailData | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

type Loaded = { key: string; data: FolderDetailData };

/**
 * Loads one folder for display. All the work lives in `FolderService.load`, so
 * this hook stays a cache-shaped wrapper — and the folder a screen renders is
 * ordered by exactly the code that orders the queue.
 *
 * Keyed by folder key like `usePlaylistDetail`, so navigating between two
 * folders never flashes the previous one's tracks.
 */
export function useFolderDetail(folderKey: string | null | undefined): UseFolderDetailResult {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    if (!folderKey) {
      return;
    }
    let cancelled = false;
    void FolderService.load(folderKey).then((data) => {
      if (!cancelled) {
        setLoaded({ key: folderKey, data });
        setPending(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [folderKey]);

  const refresh = useCallback(async () => {
    if (!folderKey) {
      setLoaded(null);
      setPending(false);
      return;
    }
    setLoaded({ key: folderKey, data: await FolderService.load(folderKey) });
    setPending(false);
  }, [folderKey]);

  const data = loaded && loaded.key === folderKey ? loaded.data : null;
  const loading = folderKey ? pending && data === null : false;

  return { data, loading, refresh };
}
