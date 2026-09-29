/**
 * The manahej.ir adapter.
 *
 * manahej.ir ("رادیو مناهج") is a Persian podcast library run on WordPress with
 * the Sonaar Music Player. It has no published API, but the player itself is
 * driven by one: the front end fetches a JSON playlist per category, and the
 * WordPress REST API lists the categories. Both are public and read-only, so
 * the app reads the same two endpoints the website's own player does rather
 * than scraping rendered HTML — no markup parser, no fragile CSS selectors, and
 * nothing to break when the theme changes.
 *
 * Two facts about this source shape everything downstream:
 *
 *   1. **The audio URLs are signed and expire** (`?md5=…&expires=…`, roughly
 *      three months out). A URL stored today is a broken link later, so it is
 *      cached as a playable address and *re-resolved* from the collection
 *      before a download that happens much later.
 *   2. **The API does not report durations** (`length: false`). The real length
 *      only exists once the audio is opened, so duration arrives from the
 *      player and is written back to the row.
 */

import { cleanText } from "@/lib/online/text";
import { requestJson } from "@/lib/online/transport";
import {
  OnlineSourceError,
  type OnlineAdapter,
  type OnlineCollection,
  type OnlineTrack,
  type OnlineSource,
} from "@/lib/online/types";

const BASE_URL = "https://manahej.ir";
const REST_URL = `${BASE_URL}/wp-json/wp/v2`;
/** The site's parent category for its radio shows; its children are the shows. */
const RADIO_SLUG = "radio";

/**
 * Newest last, so a course plays in the order it was published. This is the one
 * place ordering is decided for the whole source.
 */
const TRACK_ORDER = "date_ASC";

export const MANAHEJ_SOURCE: OnlineSource = {
  id: "manahej",
  kind: "manahej",
  name: "Manahej Radio",
  nativeName: "رادیو مناهج",
  languageCode: "fa",
  homepage: BASE_URL,
  description: "Persian podcasts, book summaries and history series.",
};

/** One category, as the WordPress REST API returns it. */
type WpCategory = {
  id: number;
  name: string;
  slug: string;
  parent: number;
  count: number;
};

/** One entry of the player's `playlist.json`. Only the fields we read. */
type WpPlaylistTrack = {
  mp3?: string;
  track_title?: string;
  track_artist?: string;
  album_title?: string;
  poster?: string;
  /** A number on some sources, `false` on this one. */
  length?: number | false;
  sourcePostID?: number | string;
  optional_storelist_cta?: { "store-link"?: string; "cta-class"?: string }[];
};

type WpPlaylist = { playlist_name?: string; tracks?: WpPlaylistTrack[] };

/**
 * Percent-encode the non-ASCII characters in a URL, leaving the rest untouched.
 *
 * This source's upload paths are raw Persian (`/uploads/2026/03/نسخه-پیروزی.jpg`)
 * and a URL with raw multi-byte characters in it is rejected by some HTTP
 * stacks. `encodeURI` cannot be used: it would also re-encode the `%` of an
 * already-encoded URL, corrupting the signed audio links.
 */
function encodeNonAscii(url: string): string {
  return url.replace(/[^\x20-\x7E]/g, (char) => encodeURIComponent(char));
}

/** A URL as returned by the API, or null when the field is absent/empty. */
function cleanUrl(value: string | undefined | null): string | null {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  return encodeNonAscii(value.trim());
}

/** `manahej:195` → `195`. Throws when the key belongs to another source. */
function externalIdFromKey(collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== MANAHEJ_SOURCE.id) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  const externalId = collectionKey.slice(separator + 1);
  if (externalId.length === 0) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  return externalId;
}

function collectionPageUrl(slug: string): string {
  return encodeNonAscii(`${BASE_URL}/category/${RADIO_SLUG}/${slug}/`);
}

/**
 * The category the shows hang off, resolved from a list already in hand.
 *
 * Looked up by slug rather than hard-coded by id, because ids are assigned at
 * creation and a rebuild of the site would silently repoint a hard-coded number
 * at the wrong category. The id is then memoised for the process, and the
 * categories are passed in rather than re-fetched: the caller has just read
 * them, and asking for the same page twice per browse would be a wasted round
 * trip on every cold start.
 */
let radioCategoryId: number | null = null;

function radioCategoryIdFrom(categories: WpCategory[]): number {
  if (radioCategoryId !== null) {
    return radioCategoryId;
  }
  const radio = categories.find((category) => category.slug === RADIO_SLUG);
  if (!radio) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }
  radioCategoryId = radio.id;
  return radio.id;
}

async function listCollections(options: { signal?: AbortSignal } = {}): Promise<
  OnlineCollection[]
> {
  const categories = await requestJson<WpCategory[]>(
    `${REST_URL}/categories?per_page=100&_fields=id,name,slug,parent,count`,
    options.signal,
  );
  const parentId = radioCategoryIdFrom(categories);

  return categories
    .filter((category) => category.parent === parentId && category.count > 0)
    // Busiest first: a browse list should open on the shows that actually have
    // something to listen to, not on an alphabetical accident.
    .sort((left, right) => right.count - left.count || left.id - right.id)
    .map((category) => ({
      key: `${MANAHEJ_SOURCE.id}:${category.id}`,
      sourceId: MANAHEJ_SOURCE.id,
      externalId: String(category.id),
      // A category always has a name, but an empty one would render as a
      // nameless row rather than as a bug, so the id is the fallback.
      title: cleanText(category.name) ?? String(category.id),
      subtitle: null,
      artworkUrl: null,
      trackCount: category.count,
      languageCode: MANAHEJ_SOURCE.languageCode,
      pageUrl: collectionPageUrl(category.slug),
    }));
}

/** The post's own permalink, which the player exposes as its "share" action. */
function trackPageUrl(track: WpPlaylistTrack): string | null {
  const share = track.optional_storelist_cta?.find(
    (cta) => typeof cta["cta-class"] === "string" && cta["cta-class"].includes("share"),
  );
  return cleanUrl(share?.["store-link"]);
}

function mapTrack(track: WpPlaylistTrack, index: number): OnlineTrack | null {
  const streamUrl = cleanUrl(track.mp3);
  const title = cleanText(track.track_title);
  // A row with no audio or no name cannot be played or shown, so it is dropped
  // rather than rendered as a broken entry.
  if (!streamUrl || !title) {
    return null;
  }
  // The post id is the stable identity. The mp3 URL is not: it carries a
  // signature and an expiry, so the same episode has a different URL later.
  const externalId =
    track.sourcePostID === undefined || track.sourcePostID === null
      ? null
      : String(track.sourcePostID);
  if (!externalId) {
    return null;
  }
  return {
    externalId,
    title,
    artist: cleanText(track.track_artist),
    albumTitle: cleanText(track.album_title),
    artworkUrl: cleanUrl(track.poster),
    streamUrl,
    durationSec:
      typeof track.length === "number" && Number.isFinite(track.length) && track.length > 0
        ? Math.round(track.length)
        : 0,
    order: index + 1,
    pageUrl: trackPageUrl(track),
  };
}

async function getTracks(
  collectionKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  const externalId = externalIdFromKey(collectionKey);
  const url =
    `${BASE_URL}/?load=playlist.json` +
    `&category=${encodeURIComponent(externalId)}` +
    `&posts_per_pages=-1&single_playlist=1&srp_order=${TRACK_ORDER}`;

  const playlist = await requestJson<WpPlaylist>(url, options.signal);
  const raw = Array.isArray(playlist.tracks) ? playlist.tracks : [];

  return raw
    .map((track, index) => mapTrack(track, index))
    .filter((track): track is OnlineTrack => track !== null)
    // `order` is reassigned after filtering so it is a dense 1..n — the position
    // inside the collection the listener actually sees.
    .map((track, index) => ({ ...track, order: index + 1 }));
}

export const manahejAdapter: OnlineAdapter = {
  source: MANAHEJ_SOURCE,
  listCollections,
  getTracks,
};

/** Test-only: forgets the memoised category id. */
export function __resetForTests(): void {
  radioCategoryId = null;
}
