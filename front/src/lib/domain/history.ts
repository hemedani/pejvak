/**
 * A playback session as History reads it.
 *
 * `session.ts` already decodes the dashboard's rows and a track's timeline. This
 * is a third shape for a third question, and it is separate rather than wider
 * for the same reason `TrackDetail` sits beside `TrackSummary`: a shared type
 * with half-filled fields forces every reader to handle `undefined` for data it
 * never asked for.
 *
 * What History needs that the others do not is the **track relation**. The web
 * has no local session table to join against, so the title a row prints comes
 * from the embedded relation — one projection, one query, no second fetch and no
 * in-memory join over every track the listener owns.
 *
 * ## A missing track is not a missing session
 *
 * The model declares `track` required, but a projection can lose it and a future
 * `hardCascade` can delete a track out from under its history. The session still
 * happened, so it is kept with `track: null` and rendered as "Deleted track". A
 * dropped row would silently shorten the listener's history, which is the one
 * thing this screen must never do.
 */

import { asArray, asBoolean, asInt, asNumber, asRecord, asString, asTimestamp } from "../parse";

/** The track a session was played from, as the relation carries it. */
export type HistoryTrack = {
  /** Server `_id`, for `/library/[trackId]`. */
  id: string;
  contentHash: string;
  title: string;
  durationSec: number;
  author: string | null;
  narrator: string | null;
  artworkUrl: string | null;
  origin: "local" | "online" | string;
  sourceId: string | null;
  externalId: string | null;
  collectionKey: string | null;
  collectionTitle: string | null;
};

export type HistorySession = {
  id: string;
  /** From the session, falling back to the relation. Never invented. */
  contentHash: string;
  /** `null` when the relation was lost — the row still renders. */
  track: HistoryTrack | null;
  startedAt: number;
  endedAt: number | null;
  startPositionSec: number;
  endPositionSec: number;
  durationListenedSec: number;
  playbackSpeed: number;
  completed: boolean;
  interrupted: boolean;
  seeked: boolean;
  /** The continuous listen this session belongs to; the session id when absent. */
  stretchId: string;
  contextPlayId: string | null;
  contextType: "online" | "playlist" | string | null;
  contextKey: string | null;
};

/**
 * The projection for a history row.
 *
 * The `track` relation is asked for as a nested projection of exactly the
 * columns a row prints. `deviceInfo`, `user`, `sessions` and `annotations` are
 * deliberately absent: the list has no use for them, and a nested relation would
 * multiply the payload of a hundred-row page.
 */
export const HISTORY_SESSION_GET = {
  _id: 1,
  contentHash: 1,
  startedAt: 1,
  endedAt: 1,
  startPositionSec: 1,
  endPositionSec: 1,
  durationListenedSec: 1,
  playbackSpeed: 1,
  completed: 1,
  interrupted: 1,
  seeked: 1,
  stretchId: 1,
  contextPlayId: 1,
  contextType: 1,
  contextKey: 1,
  track: {
    _id: 1,
    contentHash: 1,
    title: 1,
    durationSec: 1,
    author: 1,
    narrator: 1,
    artworkUrl: 1,
    origin: 1,
    sourceId: 1,
    externalId: 1,
    collectionKey: 1,
    collectionTitle: 1,
  },
} as const;

/**
 * `null` when the relation cannot identify a track.
 *
 * Both halves are required because both are used: `_id` is the link, and
 * `contentHash` is the identity that survives a device change. A relation with
 * one and not the other is a partial row, and rendering half a track is worse
 * than saying the track is gone.
 */
export function parseHistoryTrack(raw: unknown): HistoryTrack | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const id = asString(record._id);
  const contentHash = asString(record.contentHash);
  if (!id || !contentHash) {
    return null;
  }

  return {
    id,
    contentHash,
    title: asString(record.title) ?? "Untitled",
    durationSec: Math.max(0, asInt(record.durationSec) ?? 0),
    author: asString(record.author),
    narrator: asString(record.narrator),
    artworkUrl: asString(record.artworkUrl),
    origin: asString(record.origin) ?? "local",
    sourceId: asString(record.sourceId),
    externalId: asString(record.externalId),
    collectionKey: asString(record.collectionKey),
    collectionTitle: asString(record.collectionTitle),
  };
}

/** `null` for a row that cannot be placed in time — it has no `_id` or no start. */
export function parseHistorySession(raw: unknown): HistorySession | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const id = asString(record._id);
  const startedAt = asTimestamp(record.startedAt);
  if (!id || startedAt === null) {
    return null;
  }

  const track = parseHistoryTrack(record.track);
  const stretchId = asString(record.stretchId);
  const contextType = asString(record.contextType);

  return {
    id,
    contentHash: asString(record.contentHash) ?? track?.contentHash ?? "",
    track,
    startedAt,
    endedAt: asTimestamp(record.endedAt),
    startPositionSec: Math.max(0, asInt(record.startPositionSec) ?? 0),
    endPositionSec: Math.max(0, asInt(record.endPositionSec) ?? 0),
    // Wall-clock time played. Clamped at zero and never "corrected" against the
    // positions: a seek moves the position without adding listening time, so
    // deriving one from the other would invent minutes nobody heard.
    durationListenedSec: Math.max(0, asInt(record.durationListenedSec) ?? 0),
    // A missing speed is 1×, not 0× — 0 would print `0×` beside every row the
    // phone recorded before it sent the field.
    playbackSpeed: asNumber(record.playbackSpeed) ?? 1,
    completed: asBoolean(record.completed),
    interrupted: asBoolean(record.interrupted),
    seeked: asBoolean(record.seeked),
    stretchId: stretchId ?? id,
    contextPlayId: asString(record.contextPlayId),
    contextType,
    contextKey: asString(record.contextKey),
  };
}

/** Preserves the act's order — newest first. */
export function parseHistoryList(raw: unknown): HistorySession[] {
  return asArray(raw)
    .map(parseHistorySession)
    .filter((session): session is HistorySession => session !== null);
}
