/**
 * A track, as the web app needs it.
 *
 * The projection sent by `getMyTracks` asks for exactly these fields and no
 * more (plan §15: "a screen that renders four fields asks for four fields").
 * This type and that projection are one decision written twice, deliberately:
 * the projection decides what crosses the wire, this decides what the UI may
 * touch, and neither is allowed to drift alone.
 */

import { asInt, asRecord, asString, asTimestamp, field } from "../parse";
import { ANNOTATION_GET, parseAnnotationList, type Annotation } from "./annotation";

export type TrackOrigin = "local" | "online" | string;

export type TrackSummary = {
  id: string;
  title: string;
  /** The true identity of a track (plan §Domain model). Never dedupe by title. */
  contentHash: string;
  durationSec: number;
  isAudiobook: boolean;
  author: string | null;
  narrator: string | null;
  artworkUrl: string | null;
  totalPlayCount: number;
  totalListenTimeSec: number;
  lastPlayedAt: number | null;
  origin: TrackOrigin;
  sourceId: string | null;
  externalId: string | null;
  collectionKey: string | null;
  collectionTitle: string | null;
};

/** The `get` projection for a track list row. One object, used by every reader. */
export const TRACK_SUMMARY_GET = {
  _id: 1,
  title: 1,
  contentHash: 1,
  durationSec: 1,
  isAudiobook: 1,
  author: 1,
  narrator: 1,
  artworkUrl: 1,
  totalPlayCount: 1,
  totalListenTimeSec: 1,
  lastPlayedAt: 1,
  origin: 1,
  sourceId: 1,
  externalId: 1,
  collectionKey: 1,
  collectionTitle: 1,
} as const;

/**
 * Returns `null` for a row that cannot be identified.
 *
 * A track without an `_id` or a `contentHash` is not a track — it is a row the
 * projection or the database lost half of. Dropping it is the honest response:
 * rendering it would put an unclickable, unmatched row in a list, and every
 * later join on `contentHash` would quietly mis-key it.
 */
export function parseTrackSummary(raw: unknown): TrackSummary | null {
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
    title: asString(record.title) ?? "بدون عنوان",
    durationSec: asInt(record.durationSec) ?? 0,
    isAudiobook: record.isAudiobook === true,
    author: asString(record.author),
    narrator: asString(record.narrator),
    artworkUrl: asString(record.artworkUrl),
    totalPlayCount: asInt(record.totalPlayCount) ?? 0,
    totalListenTimeSec: asInt(record.totalListenTimeSec) ?? 0,
    lastPlayedAt: asTimestamp(record.lastPlayedAt),
    origin: asString(record.origin) ?? "local",
    sourceId: asString(record.sourceId),
    externalId: asString(record.externalId),
    collectionKey: asString(record.collectionKey),
    collectionTitle: asString(record.collectionTitle),
  };
}

export function parseTrackList(raw: unknown): TrackSummary[] {
  if (!Array.isArray(raw)) {
    return [];
  }
  return raw.map(parseTrackSummary).filter((track): track is TrackSummary => track !== null);
}

/**
 * One track, with the facts a list row has no room for.
 *
 * Everything in `TrackSummary` plus what only a detail screen asks for: the
 * file the phone uploaded (`fileName`, `fileSizeBytes`, `mimeType`), when it was
 * added, and its notes.
 *
 * ## The notes are an embedded relation, and that is a deliberate bet
 *
 * There is no act that returns one track's notes (see
 * `lib/domain/annotation.ts`), so they arrive through `getTrackDetail`'s
 * `annotations` relation. The relation is **bounded at 1000 and sorted by
 * `positionSec`** (`models/annotation.ts`), which is exactly a marker row: a
 * track with more than a thousand notes would be a track nobody is reading, and
 * the order is already the order to render.
 *
 * Sessions are deliberately *not* embedded here even though the relation exists
 * (bounded at 50, sorted by `_id` descending). `_id` order is sync order, not
 * listening order, so the embedded list can name a session the listener heard
 * last year before one they heard yesterday. The timeline uses
 * `getTrackSessions` instead, which sorts by `startedAt` server-side and pages.
 */
export type TrackDetail = TrackSummary & {
  fileName: string | null;
  fileSizeBytes: number;
  mimeType: string | null;
  /** When the collection's audio was brought onto a device. Absent for local files. */
  downloadedAt: number | null;
  createdAt: number | null;
  updatedAt: number | null;
  /** Every note on this track, in the order the relation returns them. */
  annotations: Annotation[];
};

/**
 * The `get` projection for the track page.
 *
 * `TRACK_SUMMARY_GET` is spread rather than restated: the detail screen renders
 * the same header a row does, and two lists of the same sixteen field names
 * drift the first time one is edited.
 */
export const TRACK_DETAIL_GET = {
  ...TRACK_SUMMARY_GET,
  fileName: 1,
  fileSizeBytes: 1,
  mimeType: 1,
  downloadedAt: 1,
  createdAt: 1,
  updatedAt: 1,
  annotations: ANNOTATION_GET,
} as const;

/** `null` when the row cannot be identified — see `parseTrackSummary`. */
export function parseTrackDetail(raw: unknown): TrackDetail | null {
  const summary = parseTrackSummary(raw);
  if (!summary) {
    return null;
  }

  // `parseTrackSummary` has already proved this is a record.
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  return {
    ...summary,
    fileName: asString(record.fileName),
    fileSizeBytes: asInt(record.fileSizeBytes) ?? 0,
    mimeType: asString(record.mimeType),
    downloadedAt: asTimestamp(record.downloadedAt),
    createdAt: asTimestamp(record.createdAt),
    updatedAt: asTimestamp(record.updatedAt),
    annotations: parseAnnotationList(record.annotations),
  };
}

/**
 * Whether the web player can actually play this track (plan §1.2, §9.6).
 *
 * `local` means the bytes live on the listener's phone and the server never saw
 * them — there is no URL to fetch. This is a *state*, not a failure, and the
 * row says so instead of offering a button that cannot work.
 */
export function isPlayableOnWeb(track: TrackSummary): boolean {
  return track.origin !== "local" && (track.sourceId !== null || track.externalId !== null);
}

/** `_id` from a record that may not have one — for acts that only need identity. */
export function idOf(raw: unknown): string | null {
  return asString(field(raw, "_id"));
}
