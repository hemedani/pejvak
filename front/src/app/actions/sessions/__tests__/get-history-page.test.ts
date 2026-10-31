/**
 * The history read, with the backend mocked out.
 *
 * Three things only this layer can get wrong:
 *
 *   · **What it asks for.** `skip` is a row cursor and `limit` is the batch
 *     *plus one* — the extra row is the boundary proof, and asking for the batch
 *     alone would make every page either lie about its last stretch or lose a
 *     row.
 *   · **When it stops.** A stretch longer than a batch must be read again, not
 *     judged from its first hundred rows; a corrupt `stretchId` must cost a
 *     bounded number of reads rather than the whole history.
 *   · **What it returns on failure.** The failure comes back unchanged, because
 *     the page draws it inside its own layout.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { callAct } from "@/lib/call-act";
import { HISTORY_BATCH_ROWS } from "@/lib/domain/history-query";
import { fail, ok } from "@/lib/result";

import { getHistoryPage } from "../get-history-page";

vi.mock("@/lib/call-act", () => ({ callAct: vi.fn() }));

const callActMock = vi.mocked(callAct);

/** One row as the act sends it, in the projection the action asks for. */
function rawRow(id: string, stretchId: string, startedAt: number) {
  return {
    _id: id,
    contentHash: `hash-${id}`,
    startedAt,
    endedAt: startedAt + 60_000,
    startPositionSec: 0,
    endPositionSec: 60,
    durationListenedSec: 60,
    playbackSpeed: 1,
    completed: true,
    interrupted: false,
    seeked: false,
    stretchId,
    track: { _id: `t-${id}`, contentHash: `hash-${id}`, title: id },
  };
}

/**
 * Queues what the act would answer for rows `start`…`total - 1`, newest first.
 *
 * Positional, because `mockResolvedValueOnce` answers in call order rather than
 * reading the requested `skip`: a second page's queue must start where its
 * cursor does, or the test would be reading page one twice.
 *
 * Each response carries a full batch plus the lookahead row, exactly as the real
 * act would for `limit: HISTORY_BATCH_ROWS + 1`.
 */
function queueResponses(
  total: number,
  stretchOf: (index: number) => string,
  start = 0,
) {
  for (let skip = start; skip < total; skip += HISTORY_BATCH_ROWS) {
    const rows: unknown[] = [];
    for (let index = skip; index < Math.min(skip + HISTORY_BATCH_ROWS + 1, total); index += 1) {
      // Newest first, a second apart, so `startedAt` orders like the act's.
      rows.push(rawRow(`r${index}`, stretchOf(index), 10_000_000 - index * 1_000));
    }
    callActMock.mockResolvedValueOnce(ok(rows));
  }
}

beforeEach(() => {
  callActMock.mockReset();
});

describe("getHistoryPage", () => {
  it("asks for the batch plus one lookahead row, from the cursor", async () => {
    queueResponses(50, (index) => `S${index}`);
    await getHistoryPage({ after: 250, from: 1_000, to: 2_000 });

    const [model, act, details] = callActMock.mock.calls[0] ?? [];
    expect(model).toBe("playbackSession");
    expect(act).toBe("getMyListeningHistory");
    expect(details).toMatchObject({
      set: { skip: 250, limit: HISTORY_BATCH_ROWS + 1, from: 1_000, to: 2_000 },
    });
  });

  it("omits a range it was not given", async () => {
    queueResponses(10, (index) => `S${index}`);
    await getHistoryPage({});

    const details = callActMock.mock.calls[0]?.[2];
    expect(details?.set).not.toHaveProperty("from");
    expect(details?.set).not.toHaveProperty("to");
  });

  it("returns a failure unchanged", async () => {
    const failure = fail("offline", "connection refused");
    callActMock.mockResolvedValueOnce(failure);

    const result = await getHistoryPage({});
    expect(result).toEqual(failure);
  });

  it("stops after one batch when the next row is another stretch", async () => {
    queueResponses(300, (index) => `S${index}`);

    const result = await getHistoryPage({});
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(callActMock).toHaveBeenCalledTimes(1);
    expect(result.body.stretches).toHaveLength(HISTORY_BATCH_ROWS);
    expect(result.body.after).toBe(HISTORY_BATCH_ROWS);
    expect(result.body.hasMore).toBe(true);
  });

  it("reads a stretch that outgrows a batch as one stretch", async () => {
    // 250 sessions, all in one run. Three reads; one row in the list.
    queueResponses(250, () => "LONG");

    const result = await getHistoryPage({});
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(callActMock).toHaveBeenCalledTimes(3);
    expect(result.body.stretches).toHaveLength(1);
    expect(result.body.stretches[0]!.members).toHaveLength(250);
    // The act sends newest first, so the run's *start* is the last row read and
    // its end is the first: the end track must be the one that was playing when
    // the listen stopped, not the hundredth row of the batch.
    expect(result.body.stretches[0]!.startTrackId).toBe("t-r249");
    expect(result.body.stretches[0]!.endTrackId).toBe("t-r0");
    expect(result.body.after).toBe(250);
    expect(result.body.hasMore).toBe(false);
  });

  it("keeps a second page from splitting a stretch the first page stopped before", async () => {
    // Rows 0–149 are one-track listens; 150–299 are one long run.
    queueResponses(300, (index) => (index < 150 ? `S${index}` : "LONG"));

    const first = await getHistoryPage({});
    expect(first.success).toBe(true);
    if (!first.success) {
      return;
    }
    expect(first.body.stretches).toHaveLength(HISTORY_BATCH_ROWS);
    expect(first.body.after).toBe(100);

    callActMock.mockReset();
    queueResponses(300, (index) => (index < 150 ? `S${index}` : "LONG"), first.body.after);
    const second = await getHistoryPage({ after: first.body.after });
    expect(second.success).toBe(true);
    if (!second.success) {
      return;
    }

    // Page two begins after page one ended, and carries the long run whole.
    const ids = second.body.stretches.map((stretch) => stretch.id);
    expect(ids[0]).toBe("S100");
    expect(ids).not.toContain("S99");
    const last = second.body.stretches[second.body.stretches.length - 1]!;
    expect(last.members).toHaveLength(150);
  });

  it("gives up at the ceiling rather than reading the whole history", async () => {
    // A pathological `stretchId` that never ends. The page comes back empty —
    // short, but never a verdict invented from a prefix — after a bounded read.
    queueResponses(3_000, () => "LONG");

    const result = await getHistoryPage({});
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(callActMock).toHaveBeenCalledTimes(20);
    expect(result.body.stretches).toEqual([]);
    expect(result.body.after).toBe(0);
    expect(result.body.hasMore).toBe(true);
  });

  it("ends cleanly when the cursor is past the end", async () => {
    callActMock.mockResolvedValueOnce(ok([]));

    const result = await getHistoryPage({ after: 400 });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }

    expect(callActMock).toHaveBeenCalledTimes(1);
    expect(result.body.stretches).toEqual([]);
    expect(result.body.after).toBe(400);
    expect(result.body.hasMore).toBe(false);
  });
});
