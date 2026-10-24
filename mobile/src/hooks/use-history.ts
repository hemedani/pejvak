import { useCallback, useEffect, useRef, useState } from "react";

import {
  historyCursorFor,
  mergeHistoryPages,
  type HistoryItem,
} from "@/lib/history";
import { LocalDBService } from "@/services/LocalDBService";

/** How many stretches one page holds. Sessions per page can be larger. */
const DEFAULT_PAGE_SIZE = 50;

export type UseHistoryResult = {
  items: HistoryItem[];
  loading: boolean;
  /** True while an additional page is in flight. */
  loadingMore: boolean;
  /** Whether the last page filled, so there may be older listens. */
  hasMore: boolean;
  refresh: () => Promise<void>;
  /** Appends the next page of older listens. Safe to call repeatedly. */
  loadMore: () => Promise<void>;
};

function stretchCount(items: readonly HistoryItem[]): number {
  return new Set(items.map((item) => item.session.stretchId)).size;
}

/**
 * Local-first listening history: reads finalized sessions from SQLite so the
 * screen works offline. Server history (getMyListeningHistory) is groundwork
 * for a later multi-device pull, not used here yet.
 *
 * Paged because a listener who has used the app for a year has thousands of
 * sessions, and reading them all to draw the first screen is work the list will
 * never show. A page is a page of *stretches*; the query decides the boundary in
 * SQL so a stretch is never split across two pages.
 */
export function useHistory(pageSize = DEFAULT_PAGE_SIZE): UseHistoryResult {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  /** Flips synchronously; `onEndReached` can fire twice before a render. */
  const inFlight = useRef(false);

  useEffect(() => {
    let cancelled = false;
    void LocalDBService.getSessionsForHistory(pageSize).then((rows) => {
      if (!cancelled) {
        setItems(rows);
        setHasMore(stretchCount(rows) === pageSize);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [pageSize]);

  const refresh = useCallback(async () => {
    const rows = await LocalDBService.getSessionsForHistory(pageSize);
    setItems(rows);
    setHasMore(stretchCount(rows) === pageSize);
    setLoading(false);
  }, [pageSize]);

  const loadMore = useCallback(async () => {
    if (inFlight.current || loading || !hasMore) {
      return;
    }
    const cursor = historyCursorFor(items);
    if (!cursor) {
      return;
    }
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const rows = await LocalDBService.getSessionsForHistory(pageSize, cursor);
      setItems((previous) => mergeHistoryPages(previous, rows));
      setHasMore(stretchCount(rows) === pageSize);
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  }, [hasMore, items, loading, pageSize]);

  return { items, loading, loadingMore, hasMore, refresh, loadMore };
}
