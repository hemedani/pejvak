/**
 * Trimming a read of sessions into a page of whole stretches.
 *
 * ## Why the obvious paging is wrong
 *
 * `getMyListeningHistory` returns **sessions**, newest first, with
 * `page`/`limit`/`skip`. A page of 100 rows can end in the middle of a stretch.
 * Grouping that page and rendering "2 of 5 tracks, interrupted" would be a verdict
 * invented from a prefix: the other three members are on the next page, and the
 * last loaded session was not the last one heard.
 *
 * So a page is assembled from as many batches as it takes to reach a boundary
 * **between** stretches, and a lookahead row proves the boundary. The last group
 * is emitted only when the row after it belongs to a different stretch. The
 * action does the reading; this does the deciding, which is why it is pure and
 * tested without a backend.
 *
 * ## What `after` counts
 *
 * Rows, not pages: the number of sessions in the groups this page emitted. The
 * lookahead and any dropped tail are therefore re-read by the next page rather
 * than skipped. `after` is an offset into the act's own ordering, so it is only
 * correct while a stretch's members are contiguous in that ordering — which they
 * are, because a stretch is a run of sessions in time and the act sorts by time.
 */

import type { HistorySession } from "@/lib/domain/history";
import type { HistoryPage } from "@/lib/domain/history-query";
import { groupSessionsIntoStretches } from "@/lib/history";

/** Every row once, in arrival order — an overlapping batch must not double-count. */
function dedupe(batches: readonly HistorySession[][]): HistorySession[] {
  const seen = new Set<string>();
  const rows: HistorySession[] = [];
  for (const batch of batches) {
    for (const row of batch) {
      if (seen.has(row.id)) {
        continue;
      }
      seen.add(row.id);
      rows.push(row);
    }
  }
  return rows;
}

/**
 * The page, given every batch that was read and the row that follows them.
 *
 * `lookahead` is the boundary proof:
 *
 *   · `null` — the act had nothing after the last row, so the last group is
 *     whole and history ended;
 *   · a row from a **different** stretch — the last group is whole, and there is
 *     more history;
 *   · a row from the **same** stretch — the group continues, so it is dropped
 *     rather than judged from a prefix. It is not lost: `after` stops at its
 *     first row, and the next page starts there.
 *
 * The third case is also what the max-rows ceiling produces: a stretch that
 * needed more than the ceiling to resolve is dropped the same way, so the
 * pathological case degrades to "this page is short" instead of "this page
 * lies".
 */
export function assembleHistoryPage(input: {
  batches: readonly HistorySession[][];
  lookahead: HistorySession | null;
  after: number;
}): HistoryPage {
  const collected = dedupe(input.batches);
  const stretches = groupSessionsIntoStretches(collected);

  const lastRow = collected[collected.length - 1] ?? null;
  const resolved =
    input.lookahead === null || lastRow === null || input.lookahead.stretchId !== lastRow.stretchId;

  const emitted = resolved ? stretches : stretches.slice(0, -1);
  const emittedRowCount = emitted.reduce((total, stretch) => total + stretch.members.length, 0);

  return {
    stretches: emitted,
    after: input.after + emittedRowCount,
    // Either there is a row after this page, or rows were read and not emitted.
    // A short batch with no lookahead is the end of history.
    hasMore: input.lookahead !== null || collected.length > emittedRowCount,
  };
}
