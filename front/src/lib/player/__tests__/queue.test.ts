import { describe, expect, it } from "vitest";

import {
  clampIndex,
  moveItem,
  nextIndex,
  previousIndex,
  removeAt,
} from "../queue";
import type { PlayerTrack } from "../types";

function track(id: string): PlayerTrack {
  return {
    contentHash: id,
    title: id,
    artist: null,
    albumTitle: null,
    artworkUrl: null,
    durationSec: 60,
    origin: "online",
    sourceId: "source",
    externalId: id,
    collectionKey: null,
    collectionTitle: null,
    serverId: null,
    isLive: false,
  };
}

const queue = ["a", "b", "c", "d"].map(track);

describe("queue index", () => {
  it("clamps into the queue or reports no item", () => {
    expect(clampIndex(0, 4)).toBe(0);
    expect(clampIndex(9, 4)).toBe(3);
    expect(clampIndex(-2, 4)).toBe(0);
    expect(clampIndex(0, 0)).toBe(-1);
  });

  it("does not wrap at either end", () => {
    expect(nextIndex(1, 4)).toBe(2);
    expect(nextIndex(3, 4)).toBe(3);
    expect(previousIndex(2, 4)).toBe(1);
    expect(previousIndex(0, 4)).toBe(0);
    expect(nextIndex(0, 0)).toBe(-1);
  });
});

describe("removeAt", () => {
  it("decrements the index when an earlier item goes", () => {
    const result = removeAt(queue, 1, 2);
    expect(result.queue.map((item) => item.contentHash)).toEqual(["a", "c", "d"]);
    expect(result.index).toBe(1);
    expect(result.removedCurrent).toBe(false);
  });

  it("leaves the index alone when a later item goes", () => {
    const result = removeAt(queue, 3, 1);
    expect(result.index).toBe(1);
  });

  it("moves forward when the current item goes", () => {
    const result = removeAt(queue, 1, 1);
    expect(result.queue.map((item) => item.contentHash)).toEqual(["a", "c", "d"]);
    expect(result.index).toBe(1);
    expect(result.removedCurrent).toBe(true);
  });

  it("moves back when the last current item goes", () => {
    const result = removeAt(queue, 3, 3);
    expect(result.index).toBe(2);
    expect(result.removedCurrent).toBe(true);
  });

  it("empties the queue to -1", () => {
    const result = removeAt([track("only")], 0, 0);
    expect(result.queue).toEqual([]);
    expect(result.index).toBe(-1);
  });

  it("ignores an out-of-range removal", () => {
    const result = removeAt(queue, 9, 1);
    expect(result.queue).toBe(queue);
    expect(result.index).toBe(1);
  });
});

describe("moveItem", () => {
  it("keeps the index on the current track when it moves", () => {
    const result = moveItem(queue, 1, 3, 1);
    expect(result.queue.map((item) => item.contentHash)).toEqual(["a", "c", "d", "b"]);
    expect(result.index).toBe(3);
  });

  it("adjusts the index when an earlier item moves past it", () => {
    const result = moveItem(queue, 0, 3, 1);
    expect(result.queue.map((item) => item.contentHash)).toEqual(["b", "c", "d", "a"]);
    expect(result.queue[result.index]?.contentHash).toBe("b");
  });

  it("adjusts the index when a later item moves before it", () => {
    const result = moveItem(queue, 3, 0, 1);
    expect(result.queue.map((item) => item.contentHash)).toEqual(["d", "a", "b", "c"]);
    expect(result.queue[result.index]?.contentHash).toBe("b");
  });

  it("does not touch the list for an invalid move", () => {
    const result = moveItem(queue, 2, 2, 1);
    expect(result.queue).toBe(queue);
    expect(result.index).toBe(1);
  });
});
