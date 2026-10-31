/**
 * Turning one adapter row into a queue snapshot.
 *
 * The queue must not know a source's URL. A signed address expires between the
 * moment a collection is opened and the moment its tenth track plays, so the
 * snapshot carries the three ids a resolver needs and the hash that identifies
 * the item forever. `resolveStreamUrl` asks for a fresh address immediately
 * before load.
 *
 * The hash is computed here, in the browser: `contentHash` is part of the
 * player's identity, and Web Crypto on the server is not guaranteed. A Server
 * Action may hand over an adapter row, never a hash.
 */

import { isLiveSource } from "@/lib/online/catalogue";
import type { OnlineCollection, OnlineSource, OnlineTrack } from "@/lib/online/types";
import { onlineContentHash } from "@/lib/player/online-hash";
import type { PlayerTrack } from "@/lib/player/types";

export async function playerTrackFromOnline(
  source: OnlineSource,
  collection: Pick<OnlineCollection, "key" | "title" | "artworkUrl">,
  track: OnlineTrack,
): Promise<PlayerTrack> {
  return {
    contentHash: await onlineContentHash(source.id, track.externalId),
    title: track.title,
    artist: track.artist,
    // The collection's own title is the album a listener recognises; the
    // adapter's `albumTitle` is often the same string and sometimes absent.
    albumTitle: collection.title,
    artworkUrl: track.artworkUrl ?? collection.artworkUrl ?? null,
    durationSec: Math.max(0, Math.round(track.durationSec)),
    origin: "online",
    sourceId: source.id,
    externalId: track.externalId,
    collectionKey: collection.key,
    collectionTitle: collection.title,
    // Registration happens on first play, in the controller's `loadCurrent`.
    // Doing it here would race the first session for the server id.
    serverId: null,
    isLive: source.live === true || isLiveSource(source.id),
  };
}

/**
 * A whole collection as a queue.
 *
 * `Promise.all` is fine: each hash is a SHA-256 over a short identity string,
 * and `onlineContentHash` memoises, so re-opening a collection re-hashes
 * nothing. A worker would be a second scheduler for work measured in
 * microseconds.
 */
export async function playerQueueFromOnline(
  source: OnlineSource,
  collection: Pick<OnlineCollection, "key" | "title" | "artworkUrl">,
  tracks: readonly OnlineTrack[],
): Promise<PlayerTrack[]> {
  return Promise.all(
    tracks.map((track) => playerTrackFromOnline(source, collection, track)),
  );
}
