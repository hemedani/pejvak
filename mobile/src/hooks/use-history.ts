import { useCallback, useEffect, useRef, useState } from "react";

import { type DateRange } from "@/lib/dateRange";
import {
  historyCursorFor,
  mergeHistoryPages,
  type HistoryItem,
} from "@/lib/history";
import { LocalDBService } from "@/services/LocalDBService";

/** How many stretches one page holds. Sessions per page can be larger. */
const DEFAULT_PAGE_SIZE = 50;

/**
 * How much history a *search* reads.
 *
 * A query is filtered in JavaScript, because folding Persian spellings is not
 * something SQL can do — so searching only the page the list happens to hold
 * would answer "nothing found" for a listen three screens down, which is
 * indistinguishable from a broken search. The read is bounded anyway: a few
 * hundred stretches is more than anyone scans in one query, and an unbounded
 * read of a decade of listening on every keystroke is not.
 */
const SEARCH_READ_LIMIT = 500;

export type HistoryReadOptions = {
  /** Only reads listens that started inside these bounds. */
  range?: DateRange;
  /**
   * Read deep enough for a text search rather than a page. Pagination is off:
   * the list is showing everything the search could have matched, so "load
   * more" has nothing left to load.
   */
  deep?: boolean;
};

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
export function useHistory(
  pageSize = DEFAULT_PAGE_SIZE,
  options: HistoryReadOptions = {},
): UseHistoryResult {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  /** Flips synchronously; `onEndReached` can fire twice before a render. */
  const inFlight = useRef(false);

  // Primitives, not the range object: a caller that builds `{from, to}` inline
  // would otherwise re-read the table on every render.
  const from = options.range?.from ?? null;
  const to = options.range?.to ?? null;
  const deep = options.deep === true;
  const limit = deep ? SEARCH_READ_LIMIT : pageSize;

  useEffect(() => {
    let cancelled = false;
    void LocalDBService.getSessionsForHistory(limit, undefined, {
      from,
      to,
    }).then((rows) => {
      if (!cancelled) {
        setItems(rows);
        setHasMore(!deep && stretchCount(rows) === limit);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [deep, from, limit, to]);

  const refresh = useCallback(async () => {
    const rows = await LocalDBService.getSessionsForHistory(limit, undefined, {
      from,
      to,
    });
    setItems(rows);
    setHasMore(!deep && stretchCount(rows) === limit);
    setLoading(false);
  }, [deep, from, limit, to]);

  const loadMore = useCallback(async () => {
    // A deep read already holds every listen the search can see.
    if (deep || inFlight.current || loading || !hasMore) {
      return;
    }
    const cursor = historyCursorFor(items);
    if (!cursor) {
      return;
    }
    inFlight.current = true;
    setLoadingMore(true);
    try {
      const rows = await LocalDBService.getSessionsForHistory(pageSize, cursor, {
        from,
        to,
      });
      setItems((previous) => mergeHistoryPages(previous, rows));
      setHasMore(stretchCount(rows) === pageSize);
    } finally {
      inFlight.current = false;
      setLoadingMore(false);
    }
  }, [deep, from, hasMore, items, loading, pageSize, to]);

  return { items, loading, loadingMore, hasMore, refresh, loadMore };
}
