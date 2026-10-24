/**
 * The aminikhaah.ir podcast adapter.
 *
 * The site keeps its روضه podcasts apart from its lecture albums: an episode is
 * served at `/podcast/<id>`, has no album (`album_id` is null) and belongs to a
 * category that names the series. There is no JSON listing for them — the API's
 * album endpoints only return albums — so the episode list is read from the
 * same server-rendered pages a browser reads:
 *
 *   · `/podcast?page=N` lists twelve episodes, newest first, with the series
 *     name under each title.
 *   · `/api/songs/<id>` carries one episode's direct `dl.aminikhaah.ir` MP3,
 *     its duration and its category (the series).
 *
 * Each episode is one collection with one track. That is deliberate: the
 * catalogue screen has no series grouping, and opening a podcast must cost one
 * request rather than a scan of every listing page. The series still travels as
 * the collection's subtitle and the track's album, so the listener sees
 * "روضه امام حسین (ع)" under the episode and history keeps the grouping.
 */

import { parse as parseHtml } from "node-html-parser";

import {
  absoluteUrl,
  mapWithConcurrency,
  parseAminikhaahDuration,
} from "@/lib/online/aminikhaah";
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
const PODCAST_URL = `${BASE_URL}/podcast`;

/** How many listing pages are fetched at once. */
const PAGE_CONCURRENCY = 4;
/**
 * A listing larger than this is a changed source, not a catalogue. Bounding it
 * keeps one bad page number from allocating thousands of requests.
 */
const MAX_PODCAST_PAGES = 200;

const PODCAST_HREF = /\/podcast\/(\d+)/;
const NUMERIC_ID = /^\d+$/;
const CARD_SUBTITLE = "p.am-song-card-text";

export const AMINIKHAAH_PODCASTS_SOURCE: OnlineSource = {
  id: "aminikhaah-podcasts",
  kind: "aminikhaahpodcasts",
  name: "Aminikhaah Podcasts",
  nativeName: "پادکست‌های امینی خواه",
  languageCode: "fa",
  homepage: PODCAST_URL,
  description: "Persian روضه podcast episodes, streamed from aminikhaah.ir.",
  attribution: "Podcasts by Hojjat al-Islam Amini-Khah, streamed from aminikhaah.ir.",
};

/** One card in the podcast listing. */
type PodcastCard = {
  id: string;
  title: string | null;
  subtitle: string | null;
  artworkUrl: string | null;
};

/** The series an episode belongs to, as `/api/songs/<id>` returns it. */
type ApiPodcastCategory = {
  name: string | null;
  image_url: string | null;
};

/** One podcast episode, as the API returns it. */
type ApiPodcastSong = {
  id: number;
  title: string | null;
  file_path: string | null;
  duration: string | null;
  album_id: number | null;
  category_id: number | null;
  content_type: string | null;
  is_visible?: boolean | null;
  deleted_at?: string | null;
  image: string | null;
  category: ApiPodcastCategory | null;
};

function podcastPageUrl(page: number): string {
  return `${PODCAST_URL}?page=${page}`;
}

function podcastUrl(externalId: string): string {
  return `${PODCAST_URL}/${externalId}`;
}

/**
 * Every episode card on a listing page, merged by id.
 *
 * A card links to its episode twice — once around the cover, once around the
 * title — so the title, artwork and series have to be collected from both
 * anchors and joined.
 */
function parsePodcastCards(html: string): PodcastCard[] {
  const root = parseHtml(html);
  const main = root.querySelector("#main-content") ?? root;
  const byId = new Map<string, PodcastCard>();

  for (const anchor of main.querySelectorAll('a[href*="/podcast/"]')) {
    const id = PODCAST_HREF.exec(anchor.getAttribute("href") ?? "")?.[1];
    if (!id) {
      continue;
    }
    const image = anchor.querySelector("img");
    const heading = anchor.querySelector("h5");
    const title = cleanText(heading?.textContent) ?? cleanText(image?.getAttribute("alt"));
    const artworkUrl = absoluteUrl(image?.getAttribute("src"));
    const subtitle =
      cleanText(anchor.parentNode?.querySelector(CARD_SUBTITLE)?.textContent) ??
      cleanText(anchor.querySelector(CARD_SUBTITLE)?.textContent);

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, { id, title, subtitle, artworkUrl });
      continue;
    }
    if (!existing.title && title) {
      existing.title = title;
    }
    if (!existing.subtitle && subtitle) {
      existing.subtitle = subtitle;
    }
    if (!existing.artworkUrl && artworkUrl) {
      existing.artworkUrl = artworkUrl;
    }
  }

  return [...byId.values()];
}

/** The last page the listing links to, or 1 when it is a single page. */
function lastPageFrom(html: string): number {
  const root = parseHtml(html);
  let last = 1;
  for (const anchor of root.querySelectorAll('a[href*="/podcast?page="]')) {
    const match = /[?&]page=(\d+)/.exec(anchor.getAttribute("href") ?? "");
    if (!match) {
      continue;
    }
    const page = Number(match[1]);
    if (Number.isInteger(page) && page > last) {
      last = page;
    }
  }
  return last;
}

function toCollection(card: PodcastCard): OnlineCollection | null {
  if (!card.title) {
    return null;
  }
  return {
    key: `${AMINIKHAAH_PODCASTS_SOURCE.id}:${card.id}`,
    sourceId: AMINIKHAAH_PODCASTS_SOURCE.id,
    externalId: card.id,
    title: card.title,
    subtitle: card.subtitle,
    artworkUrl: card.artworkUrl,
    trackCount: 1,
    languageCode: AMINIKHAAH_PODCASTS_SOURCE.languageCode,
    pageUrl: podcastUrl(card.id),
  };
}

async function listCollections(
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const firstHtml = await requestText(PODCAST_URL, options.signal);
  const firstPage = parsePodcastCards(firstHtml);
  if (firstPage.length === 0) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }

  const lastPage = lastPageFrom(firstHtml);
  if (lastPage > MAX_PODCAST_PAGES) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }

  const cards = [...firstPage];
  if (lastPage > 1) {
    const numbers = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
    const pages = await mapWithConcurrency(numbers, PAGE_CONCURRENCY, async (page) => {
      const html = await requestText(podcastPageUrl(page), options.signal);
      return parsePodcastCards(html);
    });
    for (const page of pages) {
      cards.push(...page);
    }
  }

  const seen = new Set<string>();
  const collections: OnlineCollection[] = [];
  for (const card of cards) {
    if (seen.has(card.id)) {
      continue;
    }
    const collection = toCollection(card);
    if (!collection) {
      continue;
    }
    seen.add(card.id);
    collections.push(collection);
  }
  return collections;
}

/**
 * One episode by id.
 *
 * A lecture song opened through this source is not a podcast, so it is refused
 * rather than becoming a second identity for the same audio.
 */
async function fetchPodcastSong(
  externalId: string,
  signal?: AbortSignal,
): Promise<ApiPodcastSong> {
  const song = await requestJson<ApiPodcastSong>(
    `${BASE_URL}/api/songs/${externalId}`,
    signal,
  );
  if (!song || typeof song.id !== "number") {
    throw new OnlineSourceError("The source sent something unreadable.", "invalid_response");
  }
  if (song.content_type !== "podcast" || song.is_visible === false || song.deleted_at) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }
  return song;
}

async function loadPodcastSong(
  externalId: string,
  signal?: AbortSignal,
): Promise<ApiPodcastSong | null> {
  try {
    return await fetchPodcastSong(externalId, signal);
  } catch (error) {
    if (error instanceof OnlineSourceError && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}

/** The series cover, falling back to the episode's own image. */
function artworkFor(song: ApiPodcastSong): string | null {
  return absoluteUrl(song.category?.image_url) ?? absoluteUrl(song.image);
}

async function getCollection(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  if (!NUMERIC_ID.test(externalId)) {
    return null;
  }
  const song = await loadPodcastSong(externalId, options.signal);
  if (!song) {
    return null;
  }
  const title = cleanText(song.title);
  if (!title) {
    return null;
  }
  return {
    key: `${AMINIKHAAH_PODCASTS_SOURCE.id}:${externalId}`,
    sourceId: AMINIKHAAH_PODCASTS_SOURCE.id,
    externalId,
    title,
    subtitle: cleanText(song.category?.name),
    artworkUrl: artworkFor(song),
    trackCount: 1,
    languageCode: AMINIKHAAH_PODCASTS_SOURCE.languageCode,
    pageUrl: podcastUrl(externalId),
  };
}

/** `aminikhaah-podcasts:5659` → `5659`. Throws for another source. */
function externalIdFromKey(collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== AMINIKHAAH_PODCASTS_SOURCE.id) {
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
  const song = await fetchPodcastSong(externalId, options.signal);
  const title = cleanText(song.title);
  const streamUrl = absoluteUrl(song.file_path);
  // A one-track collection with no playable track is not a collection the
  // listener can do anything with; say it is gone rather than opening an empty
  // episode.
  if (!title || !streamUrl) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }
  return [
    {
      externalId: String(song.id),
      title,
      artist: null,
      albumTitle: cleanText(song.category?.name),
      artworkUrl: artworkFor(song),
      streamUrl,
      durationSec: parseAminikhaahDuration(song.duration),
      order: 1,
      pageUrl: podcastUrl(externalId),
    },
  ];
}

export const aminikhaahPodcastsAdapter: OnlineAdapter = {
  source: AMINIKHAAH_PODCASTS_SOURCE,
  listCollections,
  getCollection,
  getTracks,
};
