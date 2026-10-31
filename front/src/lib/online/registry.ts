/**
 * The online-content registry.
 *
 * One place that answers "which sources exist, and who speaks for them", so no
 * action or component ever constructs a source or reaches into an adapter
 * directly. Adding a provider means adding one adapter module and one line here.
 *
 * Server-only: an adapter holds a provider's address and its signed media URLs,
 * which have no business in a browser bundle.
 */

import "server-only";

import { aminikhaahAdapter } from "@/lib/online/adapters/aminikhaah";
import { aminikhaahPodcastsAdapter } from "@/lib/online/adapters/aminikhaah-podcasts";
import { createArchiveAdapter } from "@/lib/online/adapters/archive";
import { librivoxAdapter } from "@/lib/online/adapters/librivox";
import { manahejAdapter } from "@/lib/online/adapters/manahej";
import { radioBrowserAdapter } from "@/lib/online/adapters/radiobrowser";
import { findSource } from "@/lib/online/catalogue";
import type {
  OnlineAdapter,
  OnlineCollection,
  OnlineSource,
  OnlineSourceKind,
  OnlineTrack,
} from "@/lib/online/types";

/**
 * How a source kind becomes an adapter.
 *
 * Takes the source, not only its kind, because one kind can serve many sources:
 * the archive's language sources share this implementation and differ only in
 * the data they were built from. Keeping construction here is what stops a
 * screen from holding an adapter of its own across a reload.
 */
const ADAPTER_BUILDERS: Record<OnlineSourceKind, (source: OnlineSource) => OnlineAdapter> = {
  manahej: () => manahejAdapter,
  aminikhaah: () => aminikhaahAdapter,
  aminikhaahpodcasts: () => aminikhaahPodcastsAdapter,
  librivox: () => librivoxAdapter,
  radiobrowser: () => radioBrowserAdapter,
  archive: (source) => createArchiveAdapter(source),
};

/** The adapter for a source id, or null when nothing serves it. */
export function getAdapter(sourceId: string): OnlineAdapter | null {
  const source = findSource(sourceId);
  if (!source) {
    return null;
  }
  return ADAPTER_BUILDERS[source.kind](source);
}

/**
 * Whether a source's own id is safe to put into a URL and a cache key.
 *
 * These are numeric ids on two sources and archive identifiers / UUIDs on the
 * others. Anything with a slash, a space or a sign of traversal is not an
 * identifier we issued, so it is refused before it is interpolated.
 */
const ARCHIVE_ID = /^[A-Za-z0-9._-]{1,200}$/;
const NUMERIC_ID = /^\d+$/;
const UUID = /^[0-9A-Za-z-]{8,64}$/;

export function isValidExternalId(sourceId: string, externalId: string): boolean {
  const source = findSource(sourceId);
  if (!source) {
    return false;
  }
  switch (source.kind) {
    case "manahej":
    case "aminikhaah":
    case "aminikhaahpodcasts":
    case "librivox":
      return NUMERIC_ID.test(externalId);
    case "archive":
      return ARCHIVE_ID.test(externalId);
    case "radiobrowser":
      return UUID.test(externalId);
    default:
      return false;
  }
}

/**
 * One collection by key.
 *
 * The direct lookup is what lets a saved collection be opened without a scan
 * of the catalogue, and it is also the only route for a source that serves
 * several languages — its browse list is language-scoped, but a saved row is
 * not. A source that cannot answer a direct lookup is searched for in its own
 * language's list as a fallback.
 */
export async function loadCollection(
  sourceId: string,
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  const adapter = getAdapter(sourceId);
  if (!adapter || !isValidExternalId(sourceId, externalId)) {
    return null;
  }
  if (adapter.getCollection) {
    return adapter.getCollection(externalId, options);
  }
  const key = `${sourceId}:${externalId}`;
  const collections = await adapter.listCollections({
    signal: options.signal,
    languageCode: adapter.source.languageCode,
  });
  return collections.find((collection) => collection.key === key) ?? null;
}

/** One collection's tracks, through its adapter. */
export async function loadTracks(
  sourceId: string,
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  const adapter = getAdapter(sourceId);
  if (!adapter || !isValidExternalId(sourceId, externalId)) {
    return [];
  }
  return adapter.getTracks(`${sourceId}:${externalId}`, options);
}

export { findSource };
