import { useCallback, useEffect, useState } from "react";

import type { DateRange } from "@/lib/dateRange";
import type { LocalContextPlay } from "@/lib/db/types";
import { ContextService } from "@/services/ContextService";

/** How far a search reaches, matching the sessions half of the screen. */
const SEARCH_READ_LIMIT = 500;

export type ContextHistoryOptions = {
  range?: DateRange;
  /** Read everything a text search could match, rather than a page. */
  deep?: boolean;
};

export type UseContextHistoryResult = {
  runs: LocalContextPlay[];
  loading: boolean;
  refresh: () => Promise<void>;
};

/**
 * The collection half of the listening history: closed runs, newest first.
 *
 * Reads SQLite through `ContextService`, so the Collections tab works offline
 * exactly as the sessions list does. Only *closed* runs are returned — a run
 * still open is the one being listened to right now, and showing it as history
 * would put a second, unfinished copy of the current listen in the list.
 */
export function useContextHistory(
  limit = 200,
  options: ContextHistoryOptions = {},
): UseContextHistoryResult {
  const [runs, setRuns] = useState<LocalContextPlay[]>([]);
  const [loading, setLoading] = useState(true);

  const from = options.range?.from ?? null;
  const to = options.range?.to ?? null;
  const readLimit = options.deep === true ? SEARCH_READ_LIMIT : limit;

  useEffect(() => {
    let cancelled = false;
    void ContextService.history(readLimit, { from, to }).then((rows) => {
      if (!cancelled) {
        setRuns(rows);
        setLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [from, readLimit, to]);

  const refresh = useCallback(async () => {
    setRuns(await ContextService.history(readLimit, { from, to }));
    setLoading(false);
  }, [from, readLimit, to]);

  return { runs, loading, refresh };
}
