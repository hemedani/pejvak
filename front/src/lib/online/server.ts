/**
 * The server-side entry point to the online catalogue.
 *
 * An action never imports an adapter directly. It asks this module, which is
 * the only place that answers the three questions every action asks: is this
 * source real, does it serve this language, is this external id one we could
 * have issued. Those checks happen here so a bad URL is refused before it
 * becomes a request, and so six actions cannot each validate differently.
 *
 * Catalogue reads pass through the cache; nothing personal does. The rule is
 * the same as the cache's own: a shelf is the source's answer for a while, a
 * run or a favourite is the listener's and is never cached here.
 */

import "server-only";

import { cacheKey, cached } from "@/lib/online/cache";
import {
  findSource,
  sourceLanguages,
} from "@/lib/online/catalogue";
import { getAdapter, isValidExternalId, loadCollection, loadTracks } from "@/lib/online/registry";
import { OnlineSourceError, type OnlineCollection, type OnlineSource, type OnlineTrack } from "@/lib/online/types";

/** The source, or a typed failure the action can turn into a 404-ish state. */
export function requireSource(sourceId: string): OnlineSource {
  const source = findSource(sourceId);
  if (!source) {
    throw new OnlineSourceError("That source is not registered.", "not_found");
  }
  return source;
}

/** Whether the source serves the language the listener is browsing. */
export function servesLanguage(source: OnlineSource, languageCode: string | undefined): boolean {
  if (!languageCode) {
    return true;
  }
  return sourceLanguages(source).includes(languageCode);
}

/** Run a catalogue read through the bounded cache, keyed by every input. */
export function cachedCatalogue<T>(
  sourceId: string,
  languageCode: string | null,
  load: () => Promise<T>,
): Promise<T> {
  return cached(cacheKey({ kind: "catalogue", sourceId, languageCode }), load);
}

/** Run a collection's tracks through the cache, keyed by the whole key. */
export function cachedTracks<T>(
  sourceId: string,
  collectionKey: string,
  load: () => Promise<T>,
): Promise<T> {
  return cached(cacheKey({ kind: "tracks", sourceId, collectionKey }), load);
}

function cachedCollection<T>(
  sourceId: string,
  externalId: string,
  load: () => Promise<T>,
): Promise<T> {
  return cached(cacheKey({ kind: "collection", sourceId, externalId }), load);
}

/**
 * A source's shelf for one language.
 *
 * The language is checked here rather than in the action: a source that serves
 * German and Dutch must not be asked for Persian, and a language the source
 * does not serve is an empty shelf, not a network request that returns English.
 */
export async function listCollections(
  sourceId: string,
  languageCode: string | undefined,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection[]> {
  const source = requireSource(sourceId);
  if (!servesLanguage(source, languageCode)) {
    return [];
  }
  const adapter = getAdapter(sourceId);
  if (!adapter) {
    throw new OnlineSourceError("That source is not registered.", "not_found");
  }
  const language = languageCode ?? source.languageCode;
  return cachedCatalogue(sourceId, language, () =>
    adapter.listCollections({ signal: options.signal, languageCode }),
  );
}

/** A source's own search, when it has one. `null` means "filter locally". */
export async function searchCollections(
  sourceId: string,
  query: string,
  languageCode: string | undefined,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection[] | null> {
  const source = requireSource(sourceId);
  if (!servesLanguage(source, languageCode)) {
    return [];
  }
  const adapter = getAdapter(sourceId);
  if (!adapter) {
    throw new OnlineSourceError("That source is not registered.", "not_found");
  }
  const search = adapter.searchCollections;
  if (!search) {
    return null;
  }
  const language = languageCode ?? source.languageCode;
  return cachedCatalogue(`${sourceId}#search:${query.trim()}`, language, () =>
    search(query, { signal: options.signal, languageCode }),
  );
}

/** One collection's metadata, or null when the source no longer has it. */
export async function getCollection(
  sourceId: string,
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  requireSource(sourceId);
  if (!isValidExternalId(sourceId, externalId)) {
    return null;
  }
  return cachedCollection(sourceId, externalId, () =>
    loadCollection(sourceId, externalId, options),
  );
}

/** One collection's tracks, in the adapter's order. */
export async function getTracks(
  sourceId: string,
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  requireSource(sourceId);
  if (!isValidExternalId(sourceId, externalId)) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  return cachedTracks(sourceId, `${sourceId}:${externalId}`, () =>
    loadTracks(sourceId, externalId, options),
  );
}
