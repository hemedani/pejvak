/**
 * The playlist model and the four sequence operations.
 *
 * Two properties carry this screen, and both are easy to break without noticing:
 *
 *   · **`order` is the sequence, not the array position.** A reader that trusts
 *     the array shows a playlist in whatever order the last writer sent — which
 *     looks like the reorder button failed, not like a parsing bug.
 *   · **Every write sends the whole array, renumbered.** Add, remove and move are
 *     the same call with a different sequence, so an operation that returns the
 *     input untouched (rather than a renumbered copy) would send a stale
 *     numbering and the next read would be wrong.
 *
 * The fixtures use ObjectId-shaped ids because the parser drops anything else: a
 * playlist item that does not name a track cannot be rendered or played.
 */

import { describe, expect, it } from "vitest";

import { orderedItems, parsePlaylist, type PlaylistItem } from "../domain/playlist";
import type { TrackSummary } from "../domain/track";
import { appendTracks, moveItem, normalizeItems, playableEntries, removeTrack } from "../playlists";

const A = "6512a1f4c2b3d4e5f6a7b8c9";
const B = "6512a1f4c2b3d4e5f6a7b8ca";
const C = "6512a1f4c2b3d4e5f6a7b8cb";

function item(trackId: string, order: number): PlaylistItem {
  return { trackId, order };
}

/** Three items in order, for the sequence tests. */
function sequence(): PlaylistItem[] {
  return [item(A, 0), item(B, 1), item(C, 2)];
}

function track(overrides: Partial<TrackSummary> = {}): TrackSummary {
  return {
    id: A,
    title: "فصل یک",
    contentHash: "hash-a",
    durationSec: 600,
    isAudiobook: false,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    origin: "online",
    sourceId: "manahej",
    externalId: "7101",
    collectionKey: "manahej:190",
    collectionTitle: "تاریخ شیعه",
    ...overrides,
  };
}

describe("parsePlaylist", () => {
  it("drops a row it cannot identify or name", () => {
    expect(parsePlaylist({ title: "بدون شناسه" })).toBeNull();
    expect(parsePlaylist({ _id: "p1" })).toBeNull();
    expect(parsePlaylist("nonsense")).toBeNull();
  });

  it("turns a blank description into null and defaults isPublic", () => {
    const parsed = parsePlaylist({ _id: "p1", title: "  صبح‌ها  ", description: "   " })!;

    expect(parsed.title).toBe("صبح‌ها");
    expect(parsed.description).toBeNull();
    expect(parsed.isPublic).toBe(false);
  });

  it("drops an item that does not name a track, and one with a malformed id", () => {
    const parsed = parsePlaylist({
      _id: "p1",
      title: "صبح‌ها",
      items: [
        { trackId: A, order: 0 },
        { trackId: "not-an-object-id", order: 1 },
        { order: 2 },
        { trackId: B, order: 3 },
      ],
    })!;

    expect(parsed.items.map((entry) => entry.trackId)).toEqual([A, B]);
  });

  it("falls back to the array index when an item has no order", () => {
    const parsed = parsePlaylist({
      _id: "p1",
      title: "صبح‌ها",
      items: [{ trackId: A }, { trackId: B, order: 7 }],
    })!;

    // 0 for the first, not 0 for both: a shared default would collapse the
    // sequence into "whatever order the array arrived in".
    expect(parsed.items).toEqual([item(A, 0), item(B, 7)]);
  });

  it("collapses a duplicate track, keeping the first", () => {
    const parsed = parsePlaylist({
      _id: "p1",
      title: "صبح‌ها",
      items: [
        { trackId: A, order: 5 },
        { trackId: B, order: 1 },
        { trackId: A, order: 9 },
      ],
    })!;

    expect(parsed.items).toEqual([item(A, 5), item(B, 1)]);
  });

  it("reads timestamps from a number and from an ISO string identically", () => {
    const iso = new Date("2026-09-01T10:00:00.000Z").toISOString();
    const fromIso = parsePlaylist({ _id: "p1", title: "صبح‌ها", updatedAt: iso })!;
    const fromNumber = parsePlaylist({
      _id: "p1",
      title: "صبح‌ها",
      updatedAt: Date.parse(iso),
    })!;

    expect(fromIso.updatedAt).toBe(fromNumber.updatedAt);
  });

  it("falls back between the two timestamps, and leaves both null when neither arrived", () => {
    const onlyUpdated = parsePlaylist({ _id: "p1", title: "صبح‌ها", updatedAt: 1_000 })!;
    expect(onlyUpdated.createdAt).toBe(1_000);

    const onlyCreated = parsePlaylist({ _id: "p1", title: "صبح‌ها", createdAt: 2_000 })!;
    expect(onlyCreated.updatedAt).toBe(2_000);

    const neither = parsePlaylist({ _id: "p1", title: "صبح‌ها" })!;
    // `null`, not 0: `formatRelativeTime` says «هرگز» for null and 1970 for zero.
    expect(neither.updatedAt).toBeNull();
  });
});

describe("orderedItems", () => {
  it("reads order, not array position", () => {
    const playlist = parsePlaylist({
      _id: "p1",
      title: "صبح‌ها",
      items: [item(C, 5), item(A, 2)],
    })!;

    expect(orderedItems(playlist).map((entry) => entry.trackId)).toEqual([A, C]);
  });

  it("keeps the array order when two orders are equal", () => {
    const playlist = parsePlaylist({
      _id: "p1",
      title: "صبح‌ها",
      items: [item(B, 1), item(A, 1)],
    })!;

    expect(orderedItems(playlist).map((entry) => entry.trackId)).toEqual([B, A]);
  });

  it("does not mutate the stored array", () => {
    const playlist = parsePlaylist({
      _id: "p1",
      title: "صبح‌ها",
      items: [item(C, 5), item(A, 2)],
    })!;
    const before = playlist.items.map((entry) => ({ ...entry }));

    orderedItems(playlist);

    expect(playlist.items).toEqual(before);
  });
});

describe("normalizeItems", () => {
  it("closes gaps in the order values", () => {
    expect(normalizeItems([item(A, 0), item(B, 3), item(C, 7)])).toEqual([
      item(A, 0),
      item(B, 1),
      item(C, 2),
    ]);
  });

  it("does not mutate its input", () => {
    const input = [item(A, 4), item(B, 9)];
    const before = input.map((entry) => ({ ...entry }));

    const result = normalizeItems(input);

    expect(input).toEqual(before);
    expect(result).not.toBe(input);
  });
});

describe("appendTracks", () => {
  it("appends in the given order, skipping ids already present", () => {
    expect(appendTracks([item(A, 0)], [B, A, C])).toEqual([
      item(A, 0),
      item(B, 1),
      item(C, 2),
    ]);
  });

  it("collapses a repeat inside one batch", () => {
    // A folder can hold the same lecture under two names; two identical rows in
    // one playlist is not what the listener asked for.
    expect(appendTracks([], [A, A, B])).toEqual([item(A, 0), item(B, 1)]);
  });

  it("returns a renumbered copy when there is nothing to add", () => {
    // The caller always sends the result, so "nothing changed" must still be a
    // valid array rather than a reference the caller might not send.
    const input = [item(A, 0), item(B, 3)];
    expect(appendTracks(input, [])).toEqual([item(A, 0), item(B, 1)]);
  });
});

describe("removeTrack", () => {
  it("removes the id and renumbers the rest", () => {
    expect(removeTrack(sequence(), B)).toEqual([item(A, 0), item(C, 1)]);
  });

  it("is a no-op copy for an id that is not there", () => {
    const input = sequence();
    const result = removeTrack(input, "6512a1f4c2b3d4e5f6a7b8cc");

    expect(result).toEqual(sequence());
    expect(result).not.toBe(input);
  });
});

describe("moveItem", () => {
  it("moves a row up and down", () => {
    expect(moveItem(sequence(), 0, 1).map((entry) => entry.trackId)).toEqual([B, A, C]);
    expect(moveItem(sequence(), 2, 1).map((entry) => entry.trackId)).toEqual([A, C, B]);
    expect(moveItem(sequence(), 0, 2).map((entry) => entry.trackId)).toEqual([B, C, A]);
  });

  it("clamps at both edges instead of dropping the row", () => {
    // A move computed from a stale index must not remove an item from the list.
    expect(moveItem(sequence(), 0, -1).map((entry) => entry.trackId)).toEqual([A, B, C]);
    expect(moveItem(sequence(), 2, 3).map((entry) => entry.trackId)).toEqual([A, B, C]);
    expect(moveItem(sequence(), 9, 0).map((entry) => entry.trackId)).toEqual([A, B, C]);
  });

  it("treats a move to the same position as a no-op", () => {
    const result = moveItem(sequence(), 1, 1);
    expect(result).toEqual(sequence());
  });

  it("renumbers after a move", () => {
    expect(moveItem([item(A, 0), item(B, 5), item(C, 9)], 0, 2)).toEqual([
      item(B, 0),
      item(C, 1),
      item(A, 2),
    ]);
  });
});

describe("playableEntries", () => {
  it("keeps only what this browser can stream, in order", () => {
    const playable = playableEntries([
      { item: item(A, 0), track: track({ id: A, origin: "online" }) },
      // The bytes are on the phone: a real member, not a playable one.
      {
        item: item(B, 1),
        track: track({ id: B, origin: "local", sourceId: null, externalId: null }),
      },
      // The track left the library; the item is still a removable row.
      { item: item(C, 2), track: null },
    ]);

    expect(playable.map((entry) => entry.item.trackId)).toEqual([A]);
    expect(playable[0]!.track.id).toBe(A);
  });

  it("drops an online-origin track that has no source to resolve", () => {
    const playable = playableEntries([
      {
        item: item(A, 0),
        track: track({ origin: "online", sourceId: null, externalId: null }),
      },
    ]);

    expect(playable).toEqual([]);
  });
});
