"use server";

/**
 * One page of listening history, cut between stretches rather than through one.
 *
 * ## Why this is not `skip = page * 50`
 *
 * The act returns *sessions*, and a stretch is several of them. A page that ends
 * mid-stretch leaves the last group without its ending — and a verdict computed
 * from a prefix ("۲ از ۵ قطعه، قطع‌شده") is a claim the data does not support.
 * So the action reads batches until it can prove a boundary, and hands back whole
 * stretches only.
 *
 * The proof is one extra row. Asking for `HISTORY_BATCH_ROWS + 1` and looking at
 * the row just past the batch answers the only question that matters: does the
 * next row belong to the same stretch as the last one?
 *
 *   · different stretch → the last group is whole; emit everything;
 *   · same stretch → the group continues; drop it and point `after` at its first
 *     row, so the next page re-reads it from the beginning;
 *   · nothing after → history ended; emit everything.
 *
 * The loop is bounded by `HISTORY_MAX_ROWS`, so a corrupt `stretchId` that
 * swallows the whole history costs one page of reading rather than a request
 * that never returns.
 *
 * ## What it does not do
 *
 * No second fetch for tracks — the `track` relation is in the projection. No
 * stats act — the page's summary is a fold over the stretches it was given, and
 * says "in this page". No keyset cursor: `to` is inclusive on `startedAt` and
 * seconds collide, so there is no value the act could filter on that would be
 * unique. Offset pagination with a dedupe is what the act actually supports.
 */

import { callAct } from "@/lib/call-act";
import { parseHistoryList, HISTORY_SESSION_GET, type HistorySession } from "@/lib/domain/history";
import {
  HISTORY_BATCH_ROWS,
  HISTORY_MAX_ROWS,
  type HistoryPage,
} from "@/lib/domain/history-query";
import { assembleHistoryPage } from "@/lib/history-page";
import { ok, type ActResult } from "@/lib/result";

export type HistoryPageInput = {
  /** Rows consumed so far; where this page starts. */
  after?: number;
  from?: number;
  to?: number;
};

function whole(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? Math.floor(value) : undefined;
}

export async function getHistoryPage(
  input: HistoryPageInput = {},
): Promise<ActResult<HistoryPage>> {
  const after = Math.max(0, Math.floor(input.after ?? 0));
  const from = whole(input.from);
  const to = whole(input.to);

  const batches: HistorySession[][] = [];
  let lookahead: HistorySession | null = null;
  let offset = after;
  let collected = 0;

  while (true) {
    const result = await callAct("playbackSession", "getMyListeningHistory", {
      set: {
        skip: offset,
        limit: HISTORY_BATCH_ROWS + 1,
        ...(from === undefined ? {} : { from }),
        ...(to === undefined ? {} : { to }),
      },
      get: HISTORY_SESSION_GET,
    });

    if (!result.success) {
      return result;
    }

    const rows = parseHistoryList(result.body);
    const batch = rows.slice(0, HISTORY_BATCH_ROWS);
    // The row just past the batch, if the act had one to give.
    lookahead = rows.length > HISTORY_BATCH_ROWS ? (rows[HISTORY_BATCH_ROWS] ?? null) : null;

    if (batch.length === 0) {
      // A cursor past the end: nothing collected here, and nothing after.
      lookahead = null;
      break;
    }

    batches.push(batch);
    collected += batch.length;

    if (lookahead === null) {
      break;
    }
    if (lookahead.stretchId !== batch[batch.length - 1].stretchId) {
      // The boundary this page needed.
      break;
    }
    if (collected >= HISTORY_MAX_ROWS) {
      // Unresolved and out of budget. The assembler drops the open tail, so the
      // page is short rather than wrong.
      break;
    }

    offset += batch.length;
  }

  return ok(assembleHistoryPage({ batches, lookahead, after }));
}
