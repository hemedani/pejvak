/**
 * Continue: only partial runs, one card per collection, newest first.
 *
 * The two cases worth guarding are the ones a naive join gets wrong: a run
 * whose saved collection was removed still belongs on the shelf, and a
 * completed course must never appear there even when it is the newest row.
 */

import { describe, expect, it } from "vitest";

import { buildContinueItems, collectionForContinueItem } from "@/lib/online/continue";
import type { OnlineCollectionRow, PlaybackContextRow } from "@/lib/online/types";

function run(overrides: Partial<PlaybackContextRow> = {}): PlaybackContextRow {
  return {
    clientId: "run-1",
    contextType: "online",
    contextKey: "manahej:190",
    contextTitle: "تاریخ شیعه",
    trackCount: 10,
    startedAt: 1_000,
    endedAt: 2_000,
    lastIndex: 3,
    lastPositionSec: 125,
    listenedSec: 900,
    finishedCount: 3,
    completed: false,
    interrupted: false,
    updatedAt: 2_000,
    ...overrides,
  };
}

function saved(overrides: Partial<OnlineCollectionRow> = {}): OnlineCollectionRow {
  return {
    key: "manahej:190",
    sourceId: "manahej",
    externalId: "190",
    title: "تاریخ شیعه",
    subtitle: null,
    artworkUrl: "https://example.test/cover.jpg",
    trackCount: 10,
    languageCode: "fa",
    pageUrl: null,
    isFavorite: false,
    lastOpenedAt: 2_000,
    updatedAt: 2_000,
    ...overrides,
  };
}

describe("buildContinueItems", () => {
  it("keeps a partial run and computes its resume point", () => {
    const [item] = buildContinueItems([run()], [saved()]);

    expect(item?.key).toBe("manahej:190");
    expect(item?.resumeTargetSec).toBe(125);
    expect(item?.collection?.artworkUrl).toBe("https://example.test/cover.jpg");
  });

  it("drops a completed run", () => {
    expect(buildContinueItems([run({ completed: true })], [saved()])).toEqual([]);
  });

  it("drops a run that is still open", () => {
    expect(buildContinueItems([run({ endedAt: null })], [saved()])).toEqual([]);
  });

  it("drops a playlist run", () => {
    expect(buildContinueItems([run({ contextType: "playlist" })], [saved()])).toEqual([]);
  });

  it("keeps one card per collection, using the newest run", () => {
    const items = buildContinueItems(
      [run({ clientId: "new", lastIndex: 5 }), run({ clientId: "old", lastIndex: 1 })],
      [saved()],
    );

    expect(items).toHaveLength(1);
    expect(items[0]?.run.clientId).toBe("new");
    expect(items[0]?.lastIndex).toBe(5);
  });

  it("keeps a run whose saved collection was removed", () => {
    const [item] = buildContinueItems([run()], []);

    expect(item?.collection).toBeNull();
    expect(item?.title).toBe("تاریخ شیعه");
  });

  it("skips a malformed collection key", () => {
    expect(buildContinueItems([run({ contextKey: "190" })], [saved()])).toEqual([]);
  });

  it("respects the limit", () => {
    const runs = Array.from({ length: 5 }, (_, index) =>
      run({ clientId: `run-${index}`, contextKey: `manahej:${index}` }),
    );
    expect(buildContinueItems(runs, [], 2)).toHaveLength(2);
  });

  it("treats a run that heard every track as finished, not partial", () => {
    expect(buildContinueItems([run({ finishedCount: 10 })], [saved()])).toEqual([]);
  });
});

describe("collectionForContinueItem", () => {
  it("prefers the saved row, which carries the artwork and the language", () => {
    const [item] = buildContinueItems([run()], [saved()]);
    const collection = collectionForContinueItem(item!);

    expect(collection.artworkUrl).toBe("https://example.test/cover.jpg");
    expect(collection.languageCode).toBe("fa");
  });

  it("builds one from the run when the shelf no longer has it", () => {
    const [item] = buildContinueItems([run()], []);
    const collection = collectionForContinueItem(item!);

    expect(collection.key).toBe("manahej:190");
    expect(collection.title).toBe("تاریخ شیعه");
    expect(collection.trackCount).toBe(10);
    // Unknown, not empty: a save with this value must be refused, not written.
    expect(collection.languageCode).toBe("");
    expect(collection.artworkUrl).toBeNull();
  });
});
