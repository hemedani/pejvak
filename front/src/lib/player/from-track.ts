/**
 * Turning a server row into a queue snapshot.
 *
 * A library row already has the truth: its `contentHash` comes from
 * `getMyTracks` and is never recomputed or normalised here. A streamed item may
 * have been built from an adapter, and its hash came from `online-hash.ts`.
 */

import type { TrackDetail, TrackSummary } from "@/lib/domain/track";
import type { PendingTrack, PlayerTrack } from "./types";
import { isLiveSource } from "./stream";

export function playerTrackFromTrack(track: TrackSummary | TrackDetail): PlayerTrack {
  return {
    contentHash: track.contentHash,
    title: track.title,
    artist: track.author ?? track.narrator,
    albumTitle: track.collectionTitle,
    artworkUrl: track.artworkUrl,
    durationSec: track.durationSec,
    origin: track.origin,
    sourceId: track.sourceId,
    externalId: track.externalId,
    collectionKey: track.collectionKey,
    collectionTitle: track.collectionTitle,
    serverId: track.id,
    isLive: isLiveSource(track.sourceId),
  };
}

/**
 * The pending registration for a streamed item.
 *
 * `fileSizeBytes` is 0 because a stream has no file on the server; the act
 * accepts 0. `isAudiobook` is false because the source did not say, and
 * inventing a flag would make a podcast appear in the audiobook filter.
 */
export function pendingTrackFor(track: PlayerTrack): PendingTrack | null {
  if (track.origin === "local" || !track.sourceId || !track.externalId) {
    return null;
  }

  return {
    contentHash: track.contentHash,
    title: track.title,
    durationSec: Math.max(0, Math.round(track.durationSec)),
    fileSizeBytes: 0,
    isAudiobook: false,
    origin: "online",
    sourceId: track.sourceId,
    externalId: track.externalId,
    collectionKey: track.collectionKey,
    collectionTitle: track.collectionTitle,
    artworkUrl: track.artworkUrl,
    author: track.artist,
    narrator: null,
  };
}
