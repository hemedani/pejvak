/**
 * Cutting a read of sessions into a page of whole stretches.
 *
 * The property under test is one sentence: **a page never contains a stretch
 * whose members were not all read.** Everything else — the cursor, `hasMore` —
 * exists to make the next page able to honour it. So each case here ends by
 * checking the emitted stretches against the rows that produced them, not just
 * against a count.
 */

import { describe, expect, it } from "vitest";

import type { HistorySession } from "../domain/history";
import { assembleHistoryPage } from "../history-page";

function row(id: string, stretchId: string, startedAt: number): HistorySession {
  return {
    id,
    contentHash: `hash-${id}`,
    track: null,
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
    contextPlayId: null,
    contextType: null,
    contextKey: null,
  };
}

/** Rows in arrival order: newest first, as the act sorts them. */
const newest = (count: number) => count * 1_000;

describe("assembleHistoryPage", () => {
  it("emits every group when history ends", () => {
    const page = assembleHistoryPage({
      batches: [[row("a1", "A", newest(3)), row("a2", "A", newest(2)), row("b1", "B", newest(1))]],
      lookahead: null,
      after: 0,
    });

    expect(page.stretches.map((stretch) => stretch.id)).toEqual(["A", "B"]);
    expect(page.after).toBe(3);
    expect(page.hasMore).toBe(false);
  });

  it("emits every group when the next row belongs to another stretch", () => {
    const page = assembleHistoryPage({
      batches: [[row("a1", "A", newest(2)), row("b1", "B", newest(1))]],
      lookahead: row("c1", "C", newest(0)),
      after: 0,
    });

    expect(page.stretches.map((stretch) => stretch.id)).toEqual(["A", "B"]);
    expect(page.after).toBe(2);
    expect(page.hasMore).toBe(true);
  });

  it("drops a stretch that continues past the batch, and points the cursor at its first row", () => {
    const page = assembleHistoryPage({
      batches: [[row("a1", "A", newest(2)), row("b1", "B", newest(1))]],
      // Same stretch as the last collected row: B is not finished.
      lookahead: row("b2", "B", newest(0)),
      after: 0,
    });

    expect(page.stretches.map((stretch) => stretch.id)).toEqual(["A"]);
    // Two rows consumed, not three: B is re-read from its beginning.
    expect(page.after).toBe(1);
    expect(page.hasMore).toBe(true);
  });

  it("never emits a stretch with only some of its members", () => {
    const batches = [[row("a1", "A", newest(4))], [row("b1", "B", newest(3)), row("b2", "B", newest(2))]];

    const page = assembleHistoryPage({
      batches,
      lookahead: row("b3", "B", newest(1)),
      after: 0,
    });

    for (const stretch of page.stretches) {
      const read = batches.flat().filter((candidate) => candidate.stretchId === stretch.id);
      expect(stretch.members).toHaveLength(read.length);
    }
    // B was read in full — three rows of it — and still dropped, because a
    // fourth exists.
    expect(page.stretches.map((stretch) => stretch.id)).toEqual(["A"]);
  });

  it("emits a stretch read across two batches as one stretch", () => {
    const page = assembleHistoryPage({
      batches: [
        [row("s1", "S", newest(3)), row("s2", "S", newest(2))],
        [row("s3", "S", newest(1))],
      ],
      lookahead: null,
      after: 0,
    });

    expect(page.stretches).toHaveLength(1);
    // `buildStretch` orders members by when they started, and the act sends
    // newest first — so the listening order is the reverse of the arrival order.
    expect(page.stretches[0]!.members.map((member) => member.id)).toEqual(["s3", "s2", "s1"]);
    expect(page.stretches[0]!.endTrackId).toBeNull();
    expect(page.after).toBe(3);
    expect(page.hasMore).toBe(false);
  });

  it("dedupes a row that arrives in two batches", () => {
    const page = assembleHistoryPage({
      batches: [
        [row("s1", "S", newest(3)), row("s2", "S", newest(2))],
        [row("s2", "S", newest(2)), row("s3", "S", newest(1))],
      ],
      lookahead: null,
      after: 0,
    });

    expect(page.stretches[0]!.members.map((member) => member.id)).toEqual(["s3", "s2", "s1"]);
    expect(page.after).toBe(3);
  });

  it("adds the emitted rows to the cursor it was given", () => {
    const page = assembleHistoryPage({
      batches: [[row("a1", "A", newest(2)), row("b1", "B", newest(1))]],
      lookahead: null,
      after: 100,
    });

    expect(page.after).toBe(102);
  });

  it("is empty and final when the cursor is past the end", () => {
    const page = assembleHistoryPage({ batches: [], lookahead: null, after: 400 });

    expect(page.stretches).toEqual([]);
    expect(page.after).toBe(400);
    expect(page.hasMore).toBe(false);
  });
});
