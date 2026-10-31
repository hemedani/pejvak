/**
 * The two server rows the Discover screens read.
 *
 * Both are decoded once, here, from the wire: the backend returns bare arrays
 * and the generated declarations describe the *request*, not the response. A
 * saved collection's `key` is rebuilt from `sourceId:externalId` rather than
 * trusted from `clientId`, because it is the key the player puts into a run and
 * the row may predate a rename of either half.
 */

import {
  asArray,
  asBoolean,
  asInt,
  asRecord,
  asString,
  asTimestamp,
} from "@/lib/parse";
import { collectionKey } from "@/lib/online/catalogue";
import type { OnlineCollectionRow, PlaybackContextRow } from "@/lib/online/types";

/** The projection for a saved collection, in one place. */
export const ONLINE_COLLECTION_GET = {
  _id: 1,
  clientId: 1,
  sourceId: 1,
  externalId: 1,
  title: 1,
  subtitle: 1,
  artworkUrl: 1,
  languageCode: 1,
  trackCount: 1,
  pageUrl: 1,
  isFavorite: 1,
  lastOpenedAt: 1,
  updatedAt: 1,
} as const;

/** The projection for a run. */
export const PLAYBACK_CONTEXT_GET = {
  clientId: 1,
  contextType: 1,
  contextKey: 1,
  contextTitle: 1,
  trackCount: 1,
  startedAt: 1,
  endedAt: 1,
  lastIndex: 1,
  lastPositionSec: 1,
  listenedSec: 1,
  finishedCount: 1,
  completed: 1,
  interrupted: 1,
  updatedAt: 1,
} as const;

/** A non-negative integer, or 0. */
function count(value: unknown): number {
  return Math.max(0, asInt(value) ?? 0);
}

/** `null` when the row cannot be identified as a collection. */
export function parseOnlineCollectionRow(raw: unknown): OnlineCollectionRow | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const sourceId = asString(record.sourceId);
  const externalId = asString(record.externalId);
  const title = asString(record.title);
  if (!sourceId || !externalId || !title) {
    return null;
  }

  return {
    key: collectionKey(sourceId, externalId),
    sourceId,
    externalId,
    title,
    subtitle: asString(record.subtitle),
    artworkUrl: asString(record.artworkUrl),
    trackCount: count(record.trackCount),
    languageCode: asString(record.languageCode) ?? "",
    pageUrl: asString(record.pageUrl),
    isFavorite: asBoolean(record.isFavorite),
    lastOpenedAt: asTimestamp(record.lastOpenedAt),
    updatedAt: asTimestamp(record.updatedAt),
  };
}

export function parseOnlineCollectionRows(raw: unknown): OnlineCollectionRow[] {
  return asArray(raw)
    .map(parseOnlineCollectionRow)
    .filter((row): row is OnlineCollectionRow => row !== null);
}

/** `null` when the row is not a run this app can render. */
export function parsePlaybackContextRow(raw: unknown): PlaybackContextRow | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }
  const clientId = asString(record.clientId);
  const contextKey = asString(record.contextKey);
  const type = record.contextType;
  if (!clientId || !contextKey || (type !== "online" && type !== "playlist")) {
    return null;
  }

  return {
    clientId,
    contextType: type,
    contextKey,
    contextTitle: asString(record.contextTitle) ?? "",
    trackCount: count(record.trackCount),
    startedAt: asTimestamp(record.startedAt) ?? 0,
    endedAt: asTimestamp(record.endedAt),
    lastIndex: count(record.lastIndex),
    lastPositionSec: count(record.lastPositionSec),
    listenedSec: count(record.listenedSec),
    finishedCount: count(record.finishedCount),
    completed: asBoolean(record.completed),
    interrupted: asBoolean(record.interrupted),
    updatedAt: asTimestamp(record.updatedAt),
  };
}

export function parsePlaybackContextRows(raw: unknown): PlaybackContextRow[] {
  return asArray(raw)
    .map(parsePlaybackContextRow)
    .filter((row): row is PlaybackContextRow => row !== null);
}
