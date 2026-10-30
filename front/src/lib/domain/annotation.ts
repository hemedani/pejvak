/**
 * A note the listener left at a point in a track.
 *
 * ## Why this is parsed as a list attached to a track
 *
 * There is no `getTrackAnnotations` act, and `getMyAnnotations` takes no
 * `trackId` filter — it returns every note the listener owns, newest-updated
 * first, paginated (plan §2 C3). So a single track's notes cannot be *asked
 * for*; they are reached through the track's own `annotations` relation, which
 * `getTrackDetail` embeds, bounded at 1000 and sorted by `positionSec`
 * ascending (`models/annotation.ts`).
 *
 * That bound is the reason this shape exists separately from `TrackSummary`:
 * the relation is already in the order a marker row needs, so nothing here
 * sorts. Sorting again would be a second opinion about order.
 *
 * ## `text` may be empty, and that is not a broken row
 *
 * The model requires `text`, but a note is also allowed to be a *marker* — a
 * position with tags and no prose. `asString` maps `""` to `null` (an empty
 * title is a missing title), so an empty note is stored here as `""` rather
 * than dropped: the position is the information, and dropping the row would
 * remove a marker the listener placed.
 */

import { asArray, asInt, asRecord, asString, asTimestamp } from "../parse";

export type Annotation = {
  id: string;
  /**
   * The id the phone generated for this note before it had a server id.
   *
   * Kept because it is the only stable handle a client-created note has until
   * the sync round-trip completes (plan §8). Phase 3.4 edits and deletes notes
   * by `_id`, so this is carried for the sync reconciliation, not for display.
   */
  clientId: string | null;
  /** Where in the track, in integer seconds. */
  positionSec: number;
  /** Prose, or `""` for a marker with no text. */
  text: string;
  tags: string[];
  /** A token or a hex colour chosen on the phone; the web app does not invent one. */
  color: string | null;
  /** How many times this passage had been heard when the note was made. */
  timesPlayedBefore: number;
  createdAt: number | null;
  updatedAt: number | null;
};

export const ANNOTATION_GET = {
  _id: 1,
  clientId: 1,
  positionSec: 1,
  text: 1,
  tags: 1,
  color: 1,
  timesPlayedBefore: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

/**
 * Returns `null` for a note that cannot be placed.
 *
 * A note with no `_id` cannot be edited or deleted later, and one with no
 * `positionSec` cannot be put on a timeline — both are rows the projection or
 * the database lost half of.
 */
export function parseAnnotation(raw: unknown): Annotation | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const id = asString(record._id);
  const positionSec = asInt(record.positionSec);
  if (!id || positionSec === null) {
    return null;
  }

  return {
    id,
    clientId: asString(record.clientId),
    positionSec,
    text: asString(record.text) ?? "",
    tags: asArray(record.tags).filter((tag): tag is string => typeof tag === "string" && tag.length > 0),
    color: asString(record.color),
    timesPlayedBefore: asInt(record.timesPlayedBefore) ?? 0,
    createdAt: asTimestamp(record.createdAt),
    updatedAt: asTimestamp(record.updatedAt),
  };
}

export function parseAnnotationList(raw: unknown): Annotation[] {
  return asArray(raw)
    .map(parseAnnotation)
    .filter((annotation): annotation is Annotation => annotation !== null);
}
