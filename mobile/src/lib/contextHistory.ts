/**
 * The History screen's list model for *collections*.
 *
 * Kept beside `history.ts` rather than inside it: a session and a run are two
 * different records — one track heard once, one attempt at a whole folder — and
 * the only thing they share is the day they happened, which is what `groupByDay`
 * is for. The two lists still sort identically, because a chip that means one
 * thing on the Tracks tab and another on Collections would be a lie.
 */

import type { LocalContextPlay } from "@/lib/db/types";
import { groupByDay, type HistorySort } from "@/lib/history";

export type ContextRunSection = {
  key: string;
  title: string | null;
  data: LocalContextPlay[];
};

/**
 * Groups runs into the same shape the sessions list uses.
 *
 * "Longest" is flat for the same reason it is flat there — how long a listen ran
 * has nothing to do with the day it happened — and it means *time actually
 * listened*, not the wall-clock span between the first and last track, which for
 * a book heard over a fortnight would be a fortnight.
 */
export function buildRunSections(
  runs: readonly LocalContextPlay[],
  sort: HistorySort = "newest",
  now: number = Date.now(),
): ContextRunSection[] {
  if (sort === "longest") {
    return [
      {
        key: "longest",
        title: null,
        data: [...runs].sort(
          (a, b) => b.listenedSec - a.listenedSec || b.startedAt - a.startedAt,
        ),
      },
    ];
  }

  return groupByDay(runs, (run) => run.startedAt, now, sort).map((day) => ({
    key: day.key,
    title: day.label,
    data: day.items,
  }));
}
