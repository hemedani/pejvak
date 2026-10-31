/**
 * A queue snapshot built from an adapter row.
 *
 * The three things that matter: identity comes from the source's id (never the
 * URL), the collection key travels with every track, and a live source is
 * marked live before the player tries to resume it.
 */

import { describe, expect, it } from "vitest";

import { LIBRIVOX_SOURCE, RADIO_BROWSER_SOURCE } from "@/lib/online/catalogue";
import { playerQueueFromOnline, playerTrackFromOnline } from "@/lib/online/player-track";
import type { OnlineCollection, OnlineTrack } from "@/lib/online/types";
import { onlineContentHash } from "@/lib/player/online-hash";

const collection: Pick<OnlineCollection, "key" | "title" | "artworkUrl"> = {
  key: "librivox:1552",
  title: "Die Verwandlung",
  artworkUrl: "https://archive.org/cover.jpg",
};

const track: OnlineTrack = {
  externalId: "300",
  title: "Dritter Abschnitt",
  artist: "Franz Kafka",
  albumTitle: null,
  artworkUrl: null,
  streamUrl: "https://archive.org/download/x/03.mp3?token=rotates",
  durationSec: 420,
  order: 3,
  pageUrl: null,
};

describe("playerTrackFromOnline", () => {
  it("carries the ids, the collection and the artwork fallback", async () => {
    const player = await playerTrackFromOnline(LIBRIVOX_SOURCE, collection, track);

    expect(player).toMatchObject({
      contentHash: await onlineContentHash("librivox", "300"),
      origin: "online",
      sourceId: "librivox",
      externalId: "300",
      collectionKey: "librivox:1552",
      collectionTitle: "Die Verwandlung",
      albumTitle: "Die Verwandlung",
      artworkUrl: "https://archive.org/cover.jpg",
      serverId: null,
      isLive: false,
    });
  });

  it("marks a live source before the player can try to resume", async () => {
    const player = await playerTrackFromOnline(
      RADIO_BROWSER_SOURCE,
      { key: "radiobrowser:uuid", title: "Deutschlandfunk", artworkUrl: null },
      { ...track, externalId: "uuid", durationSec: 0 },
    );

    expect(player.isLive).toBe(true);
    expect(player.durationSec).toBe(0);
  });

  it("builds a whole queue and keeps the order", async () => {
    const queue = await playerQueueFromOnline(LIBRIVOX_SOURCE, collection, [
      track,
      { ...track, externalId: "301", order: 4 },
    ]);

    expect(queue.map((entry) => entry.externalId)).toEqual(["300", "301"]);
    expect(new Set(queue.map((entry) => entry.contentHash)).size).toBe(2);
  });

  it("does not take identity from the rotating URL", async () => {
    const first = await playerTrackFromOnline(LIBRIVOX_SOURCE, collection, track);
    const second = await playerTrackFromOnline(LIBRIVOX_SOURCE, collection, {
      ...track,
      streamUrl: "https://archive.org/download/x/03.mp3?token=different",
    });

    expect(first.contentHash).toBe(second.contentHash);
  });
});
