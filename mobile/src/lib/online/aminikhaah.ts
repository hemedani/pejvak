/**
 * The aminikhaah.ir adapter.
 *
 * Aminikhaah is the Persian lecture archive of Hojjat al-Islam Amini-Khah. The
 * site is Laravel with HTMX, but its player is driven by a public read-only JSON
 * API, so the catalogue and the track lists are read from the same endpoints the
 * website's own player calls rather than from rendered markup:
 *
 *   · `/api/albums?page=N` pages through the catalogue, twenty albums at a time.
 *   · `/api/categories` names the topics an album is filed under.
 *   · `/api/albums/<id>` carries the whole collection — title, cover, topic id,
 *     and every session with a direct `dl.aminikhaah.ir` MP3 and its duration.
 *
 * Search is the one exception: the site exposes no search endpoint, so its
 * results page is the only HTML this adapter reads.
 *
 * Three facts shape everything downstream:
 *
 *   1. **An album is the collection.** The site calls them albums, but a lecture
 *      series and a book reading are the same shape: one ordered set of
 *      sessions. Its topic is a grouping line, not a container. (Podcasts are a
 *      separate source — see `aminikhaahPodcasts.ts`.)
 *   2. **The catalogue does not state a size.** The count is known only on
 *      open, so the browse card prints nothing rather than claiming zero.
 *   3. **The audio URLs do not expire.** They point straight at
 *      `dl.aminikhaah.ir`, so a stored URL stays playable and a later download
 *      does not have to re-resolve the album first.
 */

import { parse as parseHtml } from "node-html-parser";

import { cleanText } from "@/lib/online/text";
import { requestJson, requestText } from "@/lib/online/transport";
import {
  OnlineSourceError,
  type OnlineAdapter,
  type OnlineCollection,
  type OnlineListOptions,
  type OnlineSource,
  type OnlineTrack,
} from "@/lib/online/types";

const BASE_URL = "https://aminikhaah.ir";
const SEARCH_URL = `${BASE_URL}/search`;

/** How many catalogue pages are fetched at once. */
const PAGE_CONCURRENCY = 4;
/**
 * A catalogue larger than this is a changed source, not a catalogue. Bounding
 * it keeps one bad `last_page` from allocating thousands of requests.
 */
const MAX_CATALOG_PAGES = 200;
/**
 * `/api/categories` lists only root topics; an album may be filed under a
 * child. These lookups fill the gaps, bounded like the page count so one bad
 * response cannot turn a browse into a crawl.
 */
const MAX_CATEGORY_LOOKUPS = 100;
/** Search results are a list, not a catalogue. */
const SEARCH_ROWS = 40;

const ALBUM_HREF = /\/album\/(\d+)/;
const NUMERIC_ID = /^\d+$/;

export const AMINIKHAAH_SOURCE: OnlineSource = {
  id: "aminikhaah",
  kind: "aminikhaah",
  name: "Aminikhaah",
  nativeName: "پایگاه امینی خواه",
  languageCode: "fa",
  homepage: BASE_URL,
  description: "Persian lectures and book readings.",
  attribution: "Lectures by Hojjat al-Islam Amini-Khah, streamed from aminikhaah.ir.",
};

/** One topic, as `/api/categories` returns it. */
type ApiCategory = {
  id: number;
  name: string | null;
  is_visible?: boolean | null;
  deleted_at?: string | null;
};

/** One album, as the catalogue and the detail endpoint return it. */
type ApiAlbum = {
  id: number;
  name: string | null;
  image_url: string | null;
  category_id: number | null;
  is_visible?: boolean | null;
  deleted_at?: string | null;
};

/** A Laravel paginator around the album list. */
type ApiAlbumPage = {
  data: ApiAlbum[];
  last_page: number;
};

/** One session inside an album. */
type ApiSong = {
  id: number;
  title: string | null;
  file_path: string | null;
  duration: string | null;
  is_visible?: boolean | null;
  deleted_at?: string | null;
};

type ApiAlbumDetail = ApiAlbum & { songs?: ApiSong[] | null };

/** A search result card, which is the one thing still read from HTML. */
type AlbumSummary = {
  id: string;
  title: string | null;
  artworkUrl: string | null;
};

/** Absolute URL for a value from the API, or null when it is absent. */
export function absoluteUrl(value: string | null | undefined): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  return trimmed.startsWith("/") ? `${BASE_URL}${trimmed}` : `${BASE_URL}/${trimmed}`;
}

/**
 * A duration printed by the site, as whole seconds.
 *
 * `MM:SS` and `HH:MM:SS` both occur on the same page. Anything unreadable is
 * `0` ("ask the player") rather than a guess, because a duration wrong by
 * sixtyfold corrupts every statistic derived from it.
 */
export function parseAminikhaahDuration(text: string | null | undefined): number {
  const match = /(\d{1,3}):([0-5]?\d)(?::([0-5]\d))?/.exec(text ?? "");
  if (!match) {
    return 0;
  }
  const first = Number(match[1]);
  const second = Number(match[2]);
  const third = match[3] === undefined ? null : Number(match[3]);
  const seconds = third === null ? first * 60 + second : first * 3600 + second * 60 + third;
  return Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
}

/** A soft-deleted or hidden row never reaches the shelf. */
function isVisible(record: {
  is_visible?: boolean | null;
  deleted_at?: string | null;
}): boolean {
  return record.is_visible !== false && !record.deleted_at;
}

function albumPageUrl(page: number): string {
  return `${BASE_URL}/api/albums?page=${page}`;
}

function albumApiUrl(externalId: string): string {
  return `${BASE_URL}/api/albums/${externalId}`;
}

function albumUrl(externalId: string): string {
  return `${BASE_URL}/album/${externalId}`;
}

/** Run `worker` over `items`, at most `limit` at a time, preserving order. */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const index = next;
      next += 1;
      results[index] = await worker(items[index] as T, index);
    }
  });
  await Promise.all(runners);
  return results;
}

/** Topic id → name, for the grouping line under an album's title. */
async function fetchCategoryNames(signal?: AbortSignal): Promise<Map<number, string>> {
  const categories = await requestJson<ApiCategory[]>(
    `${BASE_URL}/api/categories`,
    signal,
  );
  if (!Array.isArray(categories)) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }
  const names = new Map<number, string>();
  for (const category of categories) {
    if (!category || typeof category.id !== "number" || !isVisible(category)) {
      continue;
    }
    const name = cleanText(category.name);
    if (name) {
      names.set(category.id, name);
    }
  }
  return names;
}

/** Every album in the catalogue, page by page. */
async function fetchAlbumPages(signal?: AbortSignal): Promise<ApiAlbum[]> {
  const first = await requestJson<ApiAlbumPage>(albumPageUrl(1), signal);
  if (
    !Array.isArray(first.data) ||
    !Number.isInteger(first.last_page) ||
    first.last_page < 1 ||
    first.last_page > MAX_CATALOG_PAGES
  ) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }

  const albums = [...first.data];
  if (first.last_page > 1) {
    const numbers = Array.from({ length: first.last_page - 1 }, (_, index) => index + 2);
    const pages = await mapWithConcurrency(numbers, PAGE_CONCURRENCY, async (pageNumber) => {
      const page = await requestJson<ApiAlbumPage>(albumPageUrl(pageNumber), signal);
      if (!Array.isArray(page.data)) {
        throw new OnlineSourceError(
          "The source's catalogue has changed shape.",
          "invalid_response",
        );
      }
      return page.data;
    });
    for (const page of pages) {
      albums.push(...page);
    }
  }
  return albums;
}

/** One album, including its sessions. */
async function fetchAlbumDetail(
  externalId: string,
  signal?: AbortSignal,
): Promise<ApiAlbumDetail> {
  const detail = await requestJson<ApiAlbumDetail>(albumApiUrl(externalId), signal);
  if (
    !detail ||
    typeof detail.id !== "number" ||
    (detail.songs !== null && detail.songs !== undefined && !Array.isArray(detail.songs))
  ) {
    throw new OnlineSourceError("The source sent something unreadable.", "invalid_response");
  }
  return detail;
}

/**
 * The sessions that can actually be listed.
 *
 * A row with no id cannot keep its identity, no audio cannot play, and no title
 * cannot be shown; it is dropped rather than rendered as a broken entry.
 */
function playableSongs(detail: ApiAlbumDetail): ApiSong[] {
  const songs = Array.isArray(detail.songs) ? detail.songs : [];
  return songs.filter(
    (song) =>
      Boolean(song) &&
      typeof song.id === "number" &&
      isVisible(song) &&
      Boolean(cleanText(song.title)) &&
      Boolean(absoluteUrl(song.file_path)),
  );
}

/**
 * The album's topic name, or null when it cannot be named.
 *
 * A missing grouping line must not fail an open: the album and its sessions are
 * the thing the listener asked for, and the topic is a subtitle.
 */
async function categoryNameFor(
  categoryId: number | null,
  signal?: AbortSignal,
): Promise<string | null> {
  if (categoryId === null) {
    return null;
  }
  try {
    const response = await requestJson<{ category?: ApiCategory }>(
      `${BASE_URL}/api/categories/${categoryId}`,
      signal,
    );
    return cleanText(response?.category?.name) ?? null;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return null;
  }
}

/**
 * Fill in the child topics the root category list omits.
 *
 * The catalogue endpoint returns only the fourteen root topics, while an album
 * is often filed under one of their children (a lecture on Imam Hussein sits
 * under `اهل بیت`, not under the root). Without this pass a fifth of the shelf
 * would have no grouping line, so the missing ids are resolved — each one at
 * most once, and only for albums that are actually going to be listed.
 */
async function resolveCategoryNames(
  categories: Map<number, string>,
  albums: readonly ApiAlbum[],
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  const unresolved = new Set<number>();
  for (const album of albums) {
    if (
      !album ||
      typeof album.id !== "number" ||
      !isVisible(album) ||
      !cleanText(album.name)
    ) {
      continue;
    }
    if (album.category_id !== null && !categories.has(album.category_id)) {
      unresolved.add(album.category_id);
    }
  }

  const ids = [...unresolved].slice(0, MAX_CATEGORY_LOOKUPS);
  if (ids.length === 0) {
    return categories;
  }
  const names = await mapWithConcurrency(ids, PAGE_CONCURRENCY, (id) =>
    categoryNameFor(id, signal),
  );
  ids.forEach((id, index) => {
    const name = names[index];
    if (name) {
      categories.set(id, name);
    }
  });
  return categories;
}

async function listCollections(
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const [rootCategories, albums] = await Promise.all([
    fetchCategoryNames(options.signal),
    fetchAlbumPages(options.signal),
  ]);
  const categories = await resolveCategoryNames(rootCategories, albums, options.signal);

  const seen = new Set<number>();
  const collections: OnlineCollection[] = [];
  for (const album of albums) {
    if (!album || typeof album.id !== "number" || seen.has(album.id) || !isVisible(album)) {
      continue;
    }
    const title = cleanText(album.name);
    if (!title) {
      continue;
    }
    seen.add(album.id);
    collections.push({
      key: `${AMINIKHAAH_SOURCE.id}:${album.id}`,
      sourceId: AMINIKHAAH_SOURCE.id,
      externalId: String(album.id),
      title,
      subtitle:
        album.category_id === null ? null : (categories.get(album.category_id) ?? null),
      artworkUrl: absoluteUrl(album.image_url),
      // The catalogue does not state a size; the real figure is written on open.
      trackCount: 0,
      languageCode: AMINIKHAAH_SOURCE.languageCode,
      pageUrl: albumUrl(String(album.id)),
    });
  }
  return collections;
}

async function getCollection(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  if (!NUMERIC_ID.test(externalId)) {
    return null;
  }

  let detail: ApiAlbumDetail;
  try {
    detail = await fetchAlbumDetail(externalId, options.signal);
  } catch (error) {
    if (error instanceof OnlineSourceError && error.code === "not_found") {
      return null;
    }
    throw error;
  }

  const title = cleanText(detail.name);
  if (!title) {
    return null;
  }

  return {
    key: `${AMINIKHAAH_SOURCE.id}:${externalId}`,
    sourceId: AMINIKHAAH_SOURCE.id,
    externalId,
    title,
    subtitle: await categoryNameFor(detail.category_id, options.signal),
    artworkUrl: absoluteUrl(detail.image_url),
    trackCount: playableSongs(detail).length,
    languageCode: AMINIKHAAH_SOURCE.languageCode,
    pageUrl: albumUrl(externalId),
  };
}

/** `aminikhaah:27` → `27`. Throws when the key belongs to another source. */
function externalIdFromKey(collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== AMINIKHAAH_SOURCE.id) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  const externalId = collectionKey.slice(separator + 1);
  if (!NUMERIC_ID.test(externalId)) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  return externalId;
}

async function getTracks(
  collectionKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  const externalId = externalIdFromKey(collectionKey);
  const detail = await fetchAlbumDetail(externalId, options.signal);
  const albumTitle = cleanText(detail.name);
  const artworkUrl = absoluteUrl(detail.image_url);

  const tracks: OnlineTrack[] = [];
  for (const song of playableSongs(detail)) {
    const title = cleanText(song.title);
    const streamUrl = absoluteUrl(song.file_path);
    if (!title || !streamUrl) {
      continue;
    }
    tracks.push({
      externalId: String(song.id),
      title,
      artist: null,
      albumTitle,
      artworkUrl,
      streamUrl,
      durationSec: parseAminikhaahDuration(song.duration),
      order: tracks.length + 1,
      pageUrl: `${BASE_URL}/song/${song.id}`,
    });
  }
  return tracks;
}

/**
 * Every album card on a page, merged by id.
 *
 * A card links to its album twice — once around the cover, once around the
 * title — so the title and the artwork have to be collected from both anchors
 * and joined.
 */
function parseAlbumCards(html: string): AlbumSummary[] {
  const root = parseHtml(html);
  const byId = new Map<string, AlbumSummary>();
  for (const anchor of root.querySelectorAll('a[href*="/album/"]')) {
    const id = ALBUM_HREF.exec(anchor.getAttribute("href") ?? "")?.[1];
    if (!id) {
      continue;
    }
    const image = anchor.querySelector("img");
    const heading = anchor.querySelector("h5");
    const title = cleanText(heading?.textContent) ?? cleanText(image?.getAttribute("alt"));
    const artworkUrl = absoluteUrl(image?.getAttribute("src"));
    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, title, artworkUrl });
      continue;
    }
    if (!existing.title && title) {
      existing.title = title;
    }
    if (!existing.artworkUrl && artworkUrl) {
      existing.artworkUrl = artworkUrl;
    }
  }
  return [...byId.values()];
}

function toCollection(album: AlbumSummary): OnlineCollection | null {
  if (!album.title) {
    return null;
  }
  return {
    key: `${AMINIKHAAH_SOURCE.id}:${album.id}`,
    sourceId: AMINIKHAAH_SOURCE.id,
    externalId: album.id,
    title: album.title,
    subtitle: null,
    artworkUrl: album.artworkUrl,
    trackCount: 0,
    languageCode: AMINIKHAAH_SOURCE.languageCode,
    pageUrl: albumUrl(album.id),
  };
}

async function searchCollections(
  query: string,
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const text = query.trim();
  if (text.length === 0) {
    return [];
  }
  const html = await requestText(
    `${SEARCH_URL}?q=${encodeURIComponent(text)}`,
    options.signal,
  );
  const collections: OnlineCollection[] = [];
  for (const album of parseAlbumCards(html)) {
    const collection = toCollection(album);
    if (!collection) {
      continue;
    }
    collections.push(collection);
    if (collections.length >= SEARCH_ROWS) {
      break;
    }
  }
  return collections;
}

export const aminikhaahAdapter: OnlineAdapter = {
  source: AMINIKHAAH_SOURCE,
  listCollections,
  searchCollections,
  getCollection,
  getTracks,
};
