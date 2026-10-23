/**
 * One download scope's live numbers.
 *
 * The collection screen owns a collection's download through
 * `useOnlineCollection`; a series needs the same three facts — total, done and
 * the scope's own state — without loading the whole collection again. The
 * result is keyed by the scope it describes, so a late read for a series the
 * screen has scrolled away from is simply not the current key.
 */

import { useCallback, useEffect, useState } from "react";

import type { DownloadSummary } from "@/services/DownloadService";
import * as DownloadService from "@/services/DownloadService";

export type UseDownloadScopeResult = {
  /** Null until the scope has been read once. */
  summary: DownloadSummary | null;
  refresh: () => Promise<void>;
};

export function useDownloadScope(scopeKey: string | null): UseDownloadScopeResult {
  const [loaded, setLoaded] = useState<{
    key: string;
    summary: DownloadSummary;
  } | null>(null);

  useEffect(() => {
    if (!scopeKey) {
      return;
    }
    let cancelled = false;
    const read = () => {
      void DownloadService.getSummary(scopeKey).then((summary) => {
        if (!cancelled) {
          setLoaded({ key: scopeKey, summary });
        }
      });
    };
    read();
    const unsubscribe = DownloadService.subscribe(read);
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [scopeKey]);

  const refresh = useCallback(async () => {
    if (!scopeKey) {
      return;
    }
    const summary = await DownloadService.getSummary(scopeKey);
    setLoaded({ key: scopeKey, summary });
  }, [scopeKey]);

  return {
    summary: loaded?.key === scopeKey ? loaded.summary : null,
    refresh,
  };
}
