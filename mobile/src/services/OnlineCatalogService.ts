/**
 * Reading the online catalogue.
 *
 * Everything that turns a source's JSON into Pejvak rows lives here, so no
 * screen ever holds an adapter or writes a track row. Three jobs:
 *
 *   1. **Browse** — ask a source for its collections.
 *   2. **Open** — resolve one collection into local `tracks` rows, in the
 *      source's own order, ready for the existing player.
 *   3. **Degrade** — when the source cannot be reached, answer from what is
 *      already on the device instead of showing an error. A downloaded course
 *      must open on a plane.
 */

import { hashOnlineIdentity } from "@/services/ContentHashService";
import { LocalDBService } from "@/services/LocalDBService";
import {
  findLanguage,
  getAdapter,
  parseCollectionKey,
  sourcesForLanguage,
  OnlineSourceError,
  type OnlineCollection,
  type OnlineSource,
  type OnlineTrack,
} from "@/lib/online";
import type { LocalOnlineCollection, LocalTrack, UpsertOnlineCollectionInput } from "@/lib/db/types";

/**
 * How long a browsed catalogue is trusted.
 *
 * A source's show list changes when it publishes, which is not something a
 * listener needs to see mid-session; but a stale list forever would hide a new
 * show. Five minutes is long enough that walking back and forth through
 * languages costs nothing, and short enough that reopening the app sees news.
 */
const CATALOG_TTL_MS = 5 * 60_000;

const catalogCache = new Map<string, { at: number; value: OnlineCollection[] }>();

/** A source's shows, memoised for `CATALOG_TTL_MS`. */
export async function listCollections(
  sourceId: string,
  options: { signal?: AbortSignal; refresh?: boolean } = {},
): Promise<OnlineCollection[]> {
  const cached = catalogCache.get(sourceId);
  if (!options.refresh && cached && Date.now() - cached.at < CATALOG_TTL_MS) {
    return cached.value;
  }
  const adapter = getAdapter(sourceId);
  if (!adapter) {
    throw new OnlineSourceError("That source is not available.", "not_found");
  }
  const value = await adapter.listCollections({ signal: options.signal });
  catalogCache.set(sourceId, { at: Date.now(), value });
  return value;
}

/** One collection from the catalogue, or null when the source no longer lists it. */
export async function findCollection(
  key: string,
  options: { signal?: AbortSignal; refresh?: boolean } = {},
): Promise<OnlineCollection | null> {
  const parsed = parseCollectionKey(key);
  if (!parsed) {
    return null;
  }
  const collections = await listCollections(parsed.sourceId, options);
  return collections.find((collection) => collection.key === key) ?? null;
}

function toUpsertInput(collection: {
  key: string;
  sourceId: string;
  externalId: string;
  title: string;
  subtitle: string | null;
  artworkUrl: string | null;
  languageCode: string;
  trackCount: number;
  pageUrl: string | null;
}): UpsertOnlineCollectionInput {
  return {
    key: collection.key,
    sourceId: collection.sourceId,
    externalId: collection.externalId,
    title: collection.title,
    subtitle: collection.subtitle,
    artworkUrl: collection.artworkUrl,
    languageCode: collection.languageCode,
    trackCount: collection.trackCount,
    pageUrl: collection.pageUrl,
  };
}

/**
 * What a collection screen needs: the local row (favourite and download state
 * included) and the playable rows, in order.
 */
export type CollectionLoad = {
  meta: LocalOnlineCollection;
  tracks: LocalTrack[];
  /**
   * True when the source could not be reached and this is what the device
   * already had. The screen says so rather than pretending the list is fresh.
   */
  fromCache: boolean;
};

/**
 * Resolve a collection into local rows.
 *
 * The catalogue is only consulted for a collection we have never seen: a row
 * already on the device is already named, already favourited, and may already
 * be downloaded, so re-reading the catalogue to draw it would be a round trip
 * that can only make the screen worse.
 */
export async function loadCollection(
  key: string,
  options: { signal?: AbortSignal; refresh?: boolean } = {},
): Promise<CollectionLoad> {
  const parsed = parseCollectionKey(key);
  if (!parsed) {
    throw new OnlineSourceError("That collection cannot be opened.", "not_found");
  }
  const adapter = getAdapter(parsed.sourceId);
  if (!adapter) {
    throw new OnlineSourceError("That source is not available.", "not_found");
  }

  let meta = await LocalDBService.getOnlineCollection(key);
  if (!meta) {
    const remote = await findCollection(key, { ...options, refresh: options.refresh });
    if (!remote) {
      throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
    }
    meta = await LocalDBService.upsertOnlineCollection(toUpsertInput(remote));
  }

  try {
    const tracks = await syncCollectionTracks(key, meta, options);
    return { meta, tracks, fromCache: false };
  } catch (error) {
    const local = await LocalDBService.getTracksByCollection(key);
    // Only a genuinely empty collection is worth an error. Anything else is a
    // collection the listener can still use, and saying so beats a spinner.
    if (local.length === 0) {
      throw error;
    }
    return { meta, tracks: local, fromCache: true };
  }
}

/**
 * Re-resolve the collection's tracks and write them to the device.
 *
 * Idempotent by design: each item is matched on the hash of its source id, so
 * running this again — because a signature expired, because the listener pulled
 * to refresh, or because a download needs fresh URLs — updates the existing rows
 * rather than creating a second copy of every episode.
 */
async function syncCollectionTracks(
  key: string,
  meta: LocalOnlineCollection,
  options: { signal?: AbortSignal } = {},
): Promise<LocalTrack[]> {
  const adapter = getAdapter(meta.sourceId);
  if (!adapter) {
    throw new OnlineSourceError("That source is not available.", "not_found");
  }
  const remote = await adapter.getTracks(key, { signal: options.signal });

  for (const track of remote) {
    const contentHash = await hashOnlineIdentity(meta.sourceId, track.externalId);
    await LocalDBService.upsertOnlineTrack({
      contentHash,
      title: track.title,
      streamUrl: track.streamUrl,
      sourceId: meta.sourceId,
      externalId: track.externalId,
      collectionKey: key,
      collectionTitle: meta.title,
      artworkUrl: track.artworkUrl ?? meta.artworkUrl,
      album: track.albumTitle,
      author: track.artist,
      durationSec: track.durationSec,
      trackNumber: track.order,
    });
  }

  // The source's own cover for a show is often absent while every episode has
  // one, so the first episode's poster becomes the collection's — which is what
  // makes a saved collection show real art in Favorites instead of a gradient.
  const cover = meta.artworkUrl ?? remote.find((track) => track.artworkUrl)?.artworkUrl ?? null;
  const trackCount = remote.length > 0 ? remote.length : meta.trackCount;
  if (cover !== meta.artworkUrl || trackCount !== meta.trackCount) {
    meta = await LocalDBService.upsertOnlineCollection({
      ...toUpsertInput(meta),
      artworkUrl: cover,
      trackCount,
    });
  }

  return LocalDBService.getTracksByCollection(key);
}

/**
 * The source's current stream URLs, keyed by the item's external id.
 *
 * Downloads need this rather than the stored `stream_url`, because the source
 * signs its URLs and they expire: a course queued today and downloaded next
 * month would otherwise fail on every file. Re-resolving also refreshes the
 * rows, so playback and downloads agree on what is current.
 */
export async function resolveStreamUrls(
  key: string,
  options: { signal?: AbortSignal } = {},
): Promise<Map<string, OnlineTrack>> {
  const parsed = parseCollectionKey(key);
  if (!parsed) {
    throw new OnlineSourceError("That collection cannot be opened.", "not_found");
  }
  const adapter = getAdapter(parsed.sourceId);
  if (!adapter) {
    throw new OnlineSourceError("That source is not available.", "not_found");
  }
  const remote = await adapter.getTracks(key, { signal: options.signal });
  return new Map(remote.map((track) => [track.externalId, track]));
}

/** Save (and optionally favourite) a collection straight from a Browse list. */
export async function saveCollection(
  collection: OnlineCollection,
  options: { favorite?: boolean } = {},
): Promise<LocalOnlineCollection> {
  const saved = await LocalDBService.upsertOnlineCollection(toUpsertInput(collection));
  if (options.favorite === undefined) {
    return saved;
  }
  await LocalDBService.setOnlineCollectionFavorite(collection.key, options.favorite);
  return { ...saved, isFavorite: options.favorite };
}

export async function setFavorite(key: string, isFavorite: boolean): Promise<void> {
  await LocalDBService.setOnlineCollectionFavorite(key, isFavorite);
}

/** Records that a collection was opened, which is what orders the Continue tab. */
export async function markOpened(key: string): Promise<void> {
  await LocalDBService.touchOnlineCollectionOpened(key);
}

export async function removeCollection(key: string): Promise<void> {
  await LocalDBService.softDeleteOnlineCollection(key);
}

export async function getSavedCollections(): Promise<LocalOnlineCollection[]> {
  return LocalDBService.getOnlineCollections();
}

export async function getFavoriteCollections(): Promise<LocalOnlineCollection[]> {
  return LocalDBService.getFavoriteOnlineCollections();
}

export async function getCollection(key: string): Promise<LocalOnlineCollection | null> {
  return LocalDBService.getOnlineCollection(key);
}

/** The sources that serve one language. Empty is a real answer, not an error. */
export function sourcesFor(languageCode: string): readonly OnlineSource[] {
  return sourcesForLanguage(languageCode);
}

export function describeLanguage(code: string): string {
  return findLanguage(code)?.nativeName ?? code;
}

/**
 * Everything that reads or keeps the online catalogue.
 *
 * Plain module functions composed into an object, the same shape as
 * `FolderService` and `PlaylistService` — so a screen that already holds
 * `OnlineCatalogService` needs one import for browse, open, save and forget,
 * instead of six named imports that will eventually be half-updated.
 */
export const OnlineCatalogService = {
  listCollections,
  findCollection,
  loadCollection,
  resolveStreamUrls,
  saveCollection,
  setFavorite,
  markOpened,
  removeCollection,
  getSavedCollections,
  getFavoriteCollections,
  getCollection,
  sourcesFor,
  describeLanguage,
  __resetForTests,
};

/** Test-only: drops the memoised catalogues. */
export function __resetForTests(): void {
  catalogCache.clear();
}
