/**
 * The drshariati.com adapter — Dr Ali Shariati's spoken books.
 *
 * The official site is WordPress, and it publishes its audiobooks as their own
 * post type (`audiobooks`) with a REST collection, so the catalogue is JSON and
 * only the episodes need HTML.
 *
 *   · `/wp-json/wp/v2/audiobooks` — every spoken book, with its slug and title.
 *   · `/audiobooks/<slug>/` — one book, with a titled `<audio>` per episode.
 *
 * Two facts shape the adapter:
 *
 *   1. **The episodes are not in the REST body.** The player is rendered by the
 *      theme from a page-builder block, so `content.rendered` carries the book's
 *      blurb and no `<audio>` at all. The listing is JSON; the episodes have to
 *      be read off the page.
 *   2. **Two page layouts, one invariant.** Some books wrap each player in
 *      `.podcast-item`, others in a bare `<div>` under `.audio-list`. What holds
 *      for both is that every `<audio>` has its title in a `<p>` inside the same
 *      wrapper, so the parser keys on the player and walks up one node rather
 *      than trusting a class.
 *
 * The MP3s are published over `http://dl.drshariati.com`, which answers `301`
 * to the same path over TLS, so the adapter upgrades the scheme instead of
 * spending a redirect on every play. (This is the opposite of the esra source,
 * whose media host has no TLS listener at all.)
 */

import { parse as parseHtml } from "node-html-parser";

import { mapWithConcurrency } from "@/lib/online/aminikhaah";
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

const BASE_URL = "https://drshariati.com";
const CATALOGUE_URL = `${BASE_URL}/wp-json/wp/v2/audiobooks?per_page=100&_fields=id,slug,link,title,date`;

/** How many book pages are read at once when the shelf is built. */
const COUNT_CONCURRENCY = 3;

/** A book's slug is its URL segment; anything else is not one of ours. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const MP3_SRC = /(?:https?:)?\/\/[^\s"'<>]+\.mp3/i;

export const SHARIATI_SOURCE: OnlineSource = {
  id: "shariati",
  kind: "shariati",
  name: "Shariati",
  nativeName: "دکتر علی شریعتی",
  languageCode: "fa",
  homepage: BASE_URL,
  description: "Dr Ali Shariati's spoken books, read in full.",
  attribution: "Spoken books by Dr Ali Shariati, streamed from drshariati.com.",
};

/** One book on the shelf, as the REST collection describes it. */
type BookEntry = {
  slug: string;
  title: string;
};

/** One episode: its title, and where the bytes are. */
type Episode = {
  title: string | null;
  streamUrl: string;
};

/** One book's page, as the adapter needs it. */
type BookPage = {
  title: string | null;
  episodes: Episode[];
};

function bookUrl(slug: string): string {
  return `${BASE_URL}/audiobooks/${slug}/`;
}

/**
 * The media host answers `301` from `http` to `https` for every file, so the
 * scheme is settled here rather than on every play. Anything already on TLS,
 * or on another host, is left exactly as the page published it.
 */
export function secureMediaUrl(url: string): string {
  return url.replace(/^http:\/\/dl\.drshariati\.com\//i, "https://dl.drshariati.com/");
}

/**
 * Every episode on a book's page.
 *
 * The player is the anchor: each `<audio>` carries its own title in a `<p>`
 * inside the same wrapper, and the wrapper's class differs between books. A
 * book whose episode has no `<p>` still plays — its title falls back to the
 * caller's numbering rather than being dropped.
 */
export function parseEpisodes(html: string): Episode[] {
  const root = parseHtml(html);
  const episodes: Episode[] = [];
  const seen = new Set<string>();

  for (const audio of root.querySelectorAll("audio")) {
    let streamUrl: string | null = null;
    for (const source of audio.querySelectorAll("source")) {
      const match = MP3_SRC.exec(source.getAttribute("src") ?? "");
      if (match) {
        streamUrl = secureMediaUrl(match[0]);
        break;
      }
    }
    if (!streamUrl || seen.has(streamUrl)) {
      continue;
    }
    seen.add(streamUrl);
    const holder = audio.parentNode;
    episodes.push({
      title: cleanText(holder?.querySelector("p")?.textContent),
      streamUrl,
    });
  }

  return episodes;
}

/** The book's own heading, which the theme renders once per page. */
export function parseBookTitle(html: string): string | null {
  return cleanText(parseHtml(html).querySelector("h1")?.textContent);
}

/**
 * The REST collection, as a list of books.
 *
 * WordPress answers a page of posts as an array, but a site with its REST API
 * restricted answers an error object with a `200`, so the shape is checked
 * rather than assumed.
 */
export function parseCatalogue(value: unknown): BookEntry[] {
  if (!Array.isArray(value)) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }
  const books: BookEntry[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== "object") {
      continue;
    }
    const record = entry as Record<string, unknown>;
    const slug = typeof record.slug === "string" ? record.slug : null;
    const titleField = record.title as { rendered?: unknown } | undefined;
    const title = cleanText(titleField?.rendered);
    if (!slug || !SLUG.test(slug) || !title || seen.has(slug)) {
      continue;
    }
    seen.add(slug);
    books.push({ slug, title });
  }
  return books;
}

async function fetchCatalogue(signal?: AbortSignal): Promise<BookEntry[]> {
  const books = parseCatalogue(await requestJson<unknown>(CATALOGUE_URL, signal));
  if (books.length === 0) {
    throw new OnlineSourceError("The source has no spoken books to offer.", "invalid_response");
  }
  return books;
}

async function fetchBook(slug: string, signal?: AbortSignal): Promise<BookPage> {
  const html = await requestText(bookUrl(slug), signal);
  return { title: parseBookTitle(html), episodes: parseEpisodes(html) };
}

/**
 * How many episodes a book has, for the shelf.
 *
 * The count is the only thing a card can say about a book before it is opened,
 * and it costs one page read per book. A page that will not load reports zero,
 * which the app reads as "not known yet" — never as "empty" — so one broken
 * book cannot make the shelf fail.
 */
async function countEpisodes(slug: string, signal?: AbortSignal): Promise<number> {
  try {
    return (await fetchBook(slug, signal)).episodes.length;
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
    return 0;
  }
}

function toCollection(entry: BookEntry, trackCount: number): OnlineCollection {
  return {
    key: `${SHARIATI_SOURCE.id}:${entry.slug}`,
    sourceId: SHARIATI_SOURCE.id,
    externalId: entry.slug,
    title: entry.title,
    subtitle: null,
    artworkUrl: null,
    trackCount,
    languageCode: SHARIATI_SOURCE.languageCode,
    pageUrl: bookUrl(entry.slug),
  };
}

async function listCollections(
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const books = await fetchCatalogue(options.signal);
  const counts = await mapWithConcurrency(books, COUNT_CONCURRENCY, (book) =>
    countEpisodes(book.slug, options.signal),
  );
  return books.map((book, index) => toCollection(book, counts[index] ?? 0));
}

async function getCollection(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  if (!SLUG.test(externalId)) {
    return null;
  }
  let page: BookPage;
  try {
    page = await fetchBook(externalId, options.signal);
  } catch (error) {
    if (error instanceof OnlineSourceError && error.code === "not_found") {
      return null;
    }
    throw error;
  }
  // A book with no player on it cannot be listened to, so it is reported as
  // gone rather than opened as an empty book.
  if (!page.title || page.episodes.length === 0) {
    return null;
  }
  return {
    key: `${SHARIATI_SOURCE.id}:${externalId}`,
    sourceId: SHARIATI_SOURCE.id,
    externalId,
    title: page.title,
    subtitle: null,
    artworkUrl: null,
    trackCount: page.episodes.length,
    languageCode: SHARIATI_SOURCE.languageCode,
    pageUrl: bookUrl(externalId),
  };
}

/** `shariati:adian1` → `adian1`. Throws when the key is not this source's. */
function slugFromKey(collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== SHARIATI_SOURCE.id) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  const slug = collectionKey.slice(separator + 1);
  if (!SLUG.test(slug)) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  return slug;
}

async function getTracks(
  collectionKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  const slug = slugFromKey(collectionKey);
  const page = await fetchBook(slug, options.signal);
  if (page.episodes.length === 0) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }

  const albumTitle = page.title;
  return page.episodes.map((episode, index) => ({
    externalId: `${slug}#${index + 1}`,
    // A book's episodes are titled "قسمت اول"…; one that is not falls back to
    // its place in the book rather than to nothing.
    title: episode.title ?? `قسمت ${index + 1}`,
    artist: null,
    albumTitle,
    artworkUrl: null,
    streamUrl: episode.streamUrl,
    // The page states no duration; the player asks the file.
    durationSec: 0,
    order: index + 1,
    pageUrl: bookUrl(slug),
  }));
}

export const shariatiAdapter: OnlineAdapter = {
  source: SHARIATI_SOURCE,
  listCollections,
  getCollection,
  getTracks,
};
