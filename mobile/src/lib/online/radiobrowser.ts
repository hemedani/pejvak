/**
 * The Radio Browser adapter.
 *
 * radio-browser.info is a community-run directory of live radio stations, with a
 * keyless JSON API served by a set of interchangeable mirrors:
 *
 *   · Servers — `/json/servers` lists the current mirrors.
 *   · Stations — `/json/stations/bylanguage/<language>` and
 *     `/json/stations/search?name=…` return station records.
 *   · A station — `/json/stations/byuuid/<uuid>` returns one record.
 *   · Play count — `/json/url/<uuid>` records a click.
 *
 * Three things matter here:
 *
 *   1. **No host is hard-coded.** Mirrors come and go, so the adapter discovers
 *      the list, picks a starting mirror at random, and walks the rest on
 *      failure. `all.api.radio-browser.info` is the final fallback because it is
 *      the project's own round-robin name rather than a single machine.
 *   2. **A station is a live stream, not a recording.** It has no duration and
 *      nothing to resume; its collection holds exactly one track, and the player
 *      is told the source is live so it starts at zero.
 *   3. **A click is a courtesy, not a requirement.** `/json/url/<uuid>` is sent
 *      at most once per station per ten minutes, fire-and-forget: a listener
 *      must never wait on it, and a failure must never affect playback.
 */

import { z } from "zod";

import { cleanText } from "@/lib/online/text";
import { requestJson } from "@/lib/online/transport";
import {
  OnlineSourceError,
  type OnlineAdapter,
  type OnlineCollection,
  type OnlineListOptions,
  type OnlineSource,
  type OnlineTrack,
} from "@/lib/online/types";

const SERVERS_URL = "https://all.api.radio-browser.info/json/servers";
/** The project's round-robin name, used when discovery itself fails. */
const FALLBACK_HOST = "all.api.radio-browser.info";
const SERVERS_TTL_MS = 10 * 60_000;
const CLICK_THROTTLE_MS = 10 * 60_000;
const BROWSE_ROWS = 40;
const SEARCH_ROWS = 40;

/** A descriptive identity is what the project asks of API clients. */
export const RADIO_BROWSER_USER_AGENT = "Pejvak/1.0 (offline-first audio player)";

const REQUEST_HEADERS = { "User-Agent": RADIO_BROWSER_USER_AGENT };

/** The language names the station directory files a station under. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  de: "german",
  nl: "dutch",
};

const CODE_BY_LANGUAGE_TOKEN: Readonly<Record<string, string>> = {
  german: "de",
  dutch: "nl",
};

export const RADIO_BROWSER_SOURCE: OnlineSource = {
  id: "radiobrowser",
  kind: "radiobrowser",
  name: "Radio Browser",
  nativeName: "Radio Browser",
  languageCode: "de",
  languageCodes: ["de", "nl"],
  live: true,
  homepage: "https://www.radio-browser.info",
  description: "Live radio stations from the community-run directory.",
  attribution: "Station data from Radio Browser, a community-run directory.",
};

const serverSchema = z
  .object({
    name: z.string().min(1),
  })
  .passthrough();

const serversSchema = z.array(z.unknown());

const stationSchema = z
  .object({
    stationuuid: z.string().min(1),
    name: z.string().nullish(),
    url_resolved: z.string().nullish(),
    homepage: z.string().nullish(),
    favicon: z.string().nullish(),
    country: z.string().nullish(),
    countrycode: z.string().nullish(),
    language: z.string().nullish(),
    tags: z.string().nullish(),
    votes: z.number().nullish(),
    clickcount: z.number().nullish(),
    lastcheckok: z.union([z.number(), z.string()]).nullish(),
  })
  .passthrough();

type Station = z.infer<typeof stationSchema>;

/** True when the directory last succeeded in reaching the station. */
function isHealthy(station: Station): boolean {
  return String(station.lastcheckok ?? "") === "1";
}

function isHttpUrl(value: string | null): value is string {
  return value !== null && /^https?:\/\//i.test(value.trim());
}

function cleanedUrl(value: unknown): string | null {
  const text = cleanText(value);
  return isHttpUrl(text) ? text : null;
}

/**
 * Every language code a station's own list names.
 *
 * A station can list several (`"english,german"`), and the order carries no
 * meaning: the one the listener asked for may be second. Returning the set is
 * what lets the caller keep a multilingual station instead of dropping it
 * because its first language happened to be another one.
 */
function stationLanguageCodes(value: unknown): string[] {
  const text = cleanText(value)?.toLowerCase();
  if (!text) {
    return [];
  }
  const codes = new Set<string>();
  for (const token of text.split(/[\s,;]+/)) {
    const code = CODE_BY_LANGUAGE_TOKEN[token];
    if (code) {
      codes.add(code);
    }
  }
  return [...codes];
}

function mapStation(raw: unknown, requestedLanguage?: string): OnlineCollection | null {
  const parsed = stationSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const station = parsed.data;
  const name = cleanText(station.name);
  // `url_resolved` is the playable address; `url` may still be a playlist or a
  // redirect, and an unhealthy station is one the directory itself gave up on.
  const streamUrl = cleanedUrl(station.url_resolved);
  if (!name || !streamUrl || !isHealthy(station)) {
    return null;
  }
  const fallbackLanguage = requestedLanguage ?? RADIO_BROWSER_SOURCE.languageCode;
  const codes = stationLanguageCodes(station.language);
  // The directory filters by language, but a station's own language list is
  // authoritative: a record whose languages do not include the requested one
  // is not what the listener asked to browse. A record with no language at all
  // keeps the request's answer rather than being discarded.
  if (requestedLanguage && codes.length > 0 && !codes.includes(requestedLanguage)) {
    return null;
  }
  const languageCode =
    requestedLanguage && codes.includes(requestedLanguage)
      ? requestedLanguage
      : (codes[0] ?? fallbackLanguage);

  return {
    key: `${RADIO_BROWSER_SOURCE.id}:${station.stationuuid}`,
    sourceId: RADIO_BROWSER_SOURCE.id,
    externalId: station.stationuuid,
    title: name,
    subtitle: cleanText(station.country) ?? cleanText(station.countrycode),
    artworkUrl: cleanedUrl(station.favicon),
    // A station is one endless track; the count is true, not unknown.
    trackCount: 1,
    languageCode,
    pageUrl: cleanedUrl(station.homepage),
  };
}

function stationFrom(raw: unknown): Station | null {
  const parsed = stationSchema.safeParse(raw);
  return parsed.success ? parsed.data : null;
}

// --- Mirror discovery and failover ---------------------------------------

let serversCache: { at: number; hosts: string[] } | null = null;

/**
 * The mirrors, with one process-wide cache.
 *
 * Discovery is a request of its own, and a listener browsing two languages in a
 * row should not pay for it twice. An aborted discovery is not cached: the
 * cancellation says nothing about which mirrors exist.
 */
async function discoverHosts(signal?: AbortSignal): Promise<string[]> {
  if (serversCache && Date.now() - serversCache.at < SERVERS_TTL_MS) {
    return serversCache.hosts;
  }

  let hosts: string[] = [];
  try {
    const body = await requestJson<unknown>(SERVERS_URL, signal, REQUEST_HEADERS);
    const parsed = serversSchema.safeParse(body);
    if (parsed.success) {
      const seen = new Set<string>();
      for (const entry of parsed.data) {
        const server = serverSchema.safeParse(entry);
        if (server.success && !seen.has(server.data.name)) {
          seen.add(server.data.name);
          hosts.push(server.data.name);
        }
      }
    }
  } catch (error) {
    if (signal?.aborted) {
      throw error;
    }
  }

  if (hosts.length === 0) {
    hosts = [FALLBACK_HOST];
  }
  serversCache = { at: Date.now(), hosts };
  return hosts;
}

/** The hosts in a random order, so load is spread rather than all landing on one. */
function shuffledHosts(hosts: readonly string[]): string[] {
  if (hosts.length <= 1) {
    return [...hosts];
  }
  const start = Math.floor(Math.random() * hosts.length);
  return [...hosts.slice(start), ...hosts.slice(0, start)];
}

/**
 * Fetch a Radio Browser path, walking the mirrors until one answers.
 *
 * A mirror that accepts the connection and then says something unreadable is
 * treated like a dead one: the caller validates the payload, so this function
 * only owns transport. The last typed error is re-thrown when every mirror is
 * gone, so the screen can still distinguish offline from a bad response.
 */
async function requestRadio(path: string, signal?: AbortSignal): Promise<unknown> {
  const hosts = shuffledHosts(await discoverHosts(signal));
  let lastError: unknown = null;

  for (const host of hosts) {
    try {
      return await requestJson<unknown>(`https://${host}${path}`, signal, REQUEST_HEADERS);
    } catch (error) {
      lastError = error;
      if (signal?.aborted) {
        throw error;
      }
    }
  }

  throw lastError ?? new OnlineSourceError("Could not reach the source.", "offline");
}

function parseStations(body: unknown): unknown[] {
  if (!Array.isArray(body)) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }
  return body;
}

function mapStations(
  body: unknown,
  requestedLanguage: string | undefined,
  limit: number,
): OnlineCollection[] {
  const collections: OnlineCollection[] = [];
  for (const raw of parseStations(body)) {
    const collection = mapStation(raw, requestedLanguage);
    if (!collection) {
      continue;
    }
    collections.push(collection);
    if (collections.length >= limit) {
      break;
    }
  }
  return collections;
}

function stationListUrl(path: string, parameters: Record<string, string>): string {
  const query = new URLSearchParams({
    limit: String(BROWSE_ROWS),
    order: "votes",
    reverse: "true",
    hidebroken: "true",
    ...parameters,
  });
  return `${path}?${query.toString()}`;
}

async function listCollections(options: OnlineListOptions = {}): Promise<OnlineCollection[]> {
  const languageCode = options.languageCode ?? RADIO_BROWSER_SOURCE.languageCode;
  const languageName = LANGUAGE_NAMES[languageCode];
  if (!languageName) {
    return [];
  }
  const body = await requestRadio(
    stationListUrl(`/json/stations/bylanguage/${encodeURIComponent(languageName)}`, {}),
    options.signal,
  );
  return mapStations(body, languageCode, BROWSE_ROWS);
}

async function searchCollections(
  query: string,
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const text = query.trim();
  if (text.length === 0) {
    return [];
  }
  const languageCode = options.languageCode ?? RADIO_BROWSER_SOURCE.languageCode;
  const languageName = LANGUAGE_NAMES[languageCode];

  const body = await requestRadio(
    stationListUrl("/json/stations/search", {
      name: text,
      limit: String(SEARCH_ROWS),
      ...(languageName ? { language: languageName } : {}),
    }),
    options.signal,
  );
  return mapStations(body, languageCode, SEARCH_ROWS);
}

/** One station by uuid, or null when the directory no longer has it. */
async function fetchStation(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<Station | null> {
  const body = await requestRadio(
    `/json/stations/byuuid/${encodeURIComponent(externalId)}`,
    options.signal,
  );
  const entries = parseStations(body);
  for (const entry of entries) {
    const station = stationFrom(entry);
    if (station) {
      return station;
    }
  }
  return null;
}

async function getCollection(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  const station = await fetchStation(externalId, options);
  return station ? mapStation(station) : null;
}

/** `radiobrowser:<uuid>` → `<uuid>`. Throws for a key from another source. */
function externalIdFromKey(collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== RADIO_BROWSER_SOURCE.id) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  const externalId = collectionKey.slice(separator + 1);
  if (externalId.length === 0) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  return externalId;
}

async function getTracks(
  collectionKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  const externalId = externalIdFromKey(collectionKey);
  const station = await fetchStation(externalId, options);
  if (!station) {
    throw new OnlineSourceError("That station is no longer on the source.", "not_found");
  }
  const collection = mapStation(station);
  const name = cleanText(station.name);
  const streamUrl = cleanedUrl(station.url_resolved);
  if (!collection || !name || !streamUrl || !isHealthy(station)) {
    throw new OnlineSourceError("That station is no longer playable.", "not_found");
  }

  // One endless track. `durationSec: 0` is "unknown/never ends", and the source
  // is marked `live` so the player does not try to resume a stale position.
  return [
    {
      externalId,
      title: name,
      artist: collection.subtitle,
      albumTitle: null,
      artworkUrl: collection.artworkUrl,
      streamUrl,
      durationSec: 0,
      order: 1,
      pageUrl: collection.pageUrl,
    },
  ];
}

// --- Play counts ----------------------------------------------------------

const clickSentAt = new Map<string, number>();

/**
 * Tell the directory a station was opened, at most once per ten minutes.
 *
 * Deliberately synchronous and silent: the player calls this on a status tick
 * and must not be given a promise it could accidentally await. The timestamp is
 * recorded before the request so two ticks in one frame cannot both fire.
 */
function notePlaybackStarted(externalId: string): void {
  const now = Date.now();
  const last = clickSentAt.get(externalId);
  if (last !== undefined && now - last < CLICK_THROTTLE_MS) {
    return;
  }
  clickSentAt.set(externalId, now);
  void requestRadio(`/json/url/${encodeURIComponent(externalId)}`).catch(() => undefined);
}

export const radioBrowserAdapter: OnlineAdapter = {
  source: RADIO_BROWSER_SOURCE,
  listCollections,
  searchCollections,
  getCollection,
  getTracks,
  notePlaybackStarted,
};

/** Test-only: forgets the mirror cache and the click throttle. */
export function __resetForTests(): void {
  serversCache = null;
  clickSentAt.clear();
}
