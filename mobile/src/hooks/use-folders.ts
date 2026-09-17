import { useCallback, useEffect, useState } from "react";

import type { FolderSummary } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";

export type UseFoldersResult = {
  folders: FolderSummary[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * Every folder holding at least one track.
 *
 * Folders are derived from `tracks.folder_key` rather than from a table the
 * user populates, so importing a lecture series makes the folder appear with no
 * extra bookkeeping — and this only ever needs to re-read one grouped query.
 */
export function useFolders(): UseFoldersResult {
  const [folders, setFolders] = useState<FolderSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void LocalDBService.getFolderSummaries().then((rows) => {
      if (!cancelled) {
        setFolders(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setFolders(await LocalDBService.getFolderSummaries());
    setLoading(false);
  }, []);

  return { folders, loading, refresh };
}
