/**
 * The mesbahyazdi.ir adapter — Ayatollah Mesbah Yazdi's spoken works.
 *
 * The institute's site is Drupal, and its "spoken works" browser is a plain
 * server-rendered view with no JSON API (`/jsonapi` is not installed). That is
 * enough: the listing already carries everything a card needs, and the work's
 * own page carries the recording.
 *
 *   · `/works/spoken?page=N` — twenty-five works per page, newest first, with
 *     the series (`مجموعه`), the subtitle and the date under each title.
 *   · `/node/<id>` — one work, with an `<audio><source>` pointing at an MP3 on
 *     the same host over HTTPS.
 *
 * Each work is one collection with one track, which is the same shape the
 * aminikhaah podcast source uses: the site's own unit of listening is a single
 * lecture, and opening it must cost one request rather than a scan of every
 * listing page. The series still travels as the collection's subtitle and the
 * track's album, so the listener sees "نظریه سیاسی اسلام" under the lecture and
 * History keeps the grouping.
 *
 * A work with no audio is dropped from the catalogue rather than shown as an
 * unplayable row: the site lists lectures, Q&A sessions and interviews together,
 * and only some of them have a recording.
 */

import { parse as parseHtml } from "node-html-parser";

import { mapWithConcurrency } from "@/lib/online/aminikhaah";
import { cleanText } from "@/lib/online/text";
import { requestText } from "@/lib/online/transport";
import {
  OnlineSourceError,
  type OnlineAdapter,
  type OnlineCollection,
  type OnlineListOptions,
  type OnlineSource,
  type OnlineTrack,
} from "@/lib/online/types";

const BASE_URL = "https://mesbahyazdi.ir";
const SPOKEN_URL = `${BASE_URL}/works/spoken`;

/** How many listing pages are fetched at once. */
const PAGE_CONCURRENCY = 4;
/**
 * A catalogue larger than this is a changed source, not a catalogue. Bounding it
 * keeps one bad `page` from allocating hundreds of requests.
 */
const MAX_PAGES = 60;

const NODE_HREF = /\/node\/(\d+)/;
const NUMERIC_ID = /^\d+$/;
const MP3_SRC = /(?:https?:)?\/\/[^\s"'<>]+\.mp3/i;

export const MESBAH_SOURCE: OnlineSource = {
  id: "mesbah",
  kind: "mesbah",
  name: "Mesbah Yazdi",
  nativeName: "پایگاه آثار علامه مصباح یزدی",
  languageCode: "fa",
  homepage: BASE_URL,
  description: "Ayatollah Mesbah Yazdi's lectures, lessons and interviews.",
  attribution: "Lectures by Ayatollah Mesbah Yazdi, streamed from mesbahyazdi.ir.",
};

/** One card in the listing. */
type SpokenCard = {
  id: string;
  title: string | null;
  subtitle: string | null;
  /** The work's series, as the listing names it, or null. */
  series: string | null;
  /** Whether the card advertises a recording. */
  hasAudio: boolean;
};

function pageUrl(page: number): string {
  return page === 1 ? SPOKEN_URL : `${SPOKEN_URL}?page=${page - 1}`;
}

function nodeUrl(externalId: string): string {
  return `${BASE_URL}/node/${externalId}`;
}

/**
 * Every card on a listing page.
 *
 * The recording's address sits in the card's own detail block (`.s-addr`) as
 * text rather than in a link, so the presence of an MP3 there is the only
 * reliable "this one can be played" signal — the alternative is the site's
 * Persian "دارای صوت" flag, which is a label rather than a fact.
 */
export function parseSpokenCards(html: string): SpokenCard[] {
  const root = parseHtml(html);
  const cards: SpokenCard[] = [];

  for (const item of root.querySelectorAll(".dexp-grid-item")) {
    const anchor = item.querySelector(".sp-t a");
    const id = NODE_HREF.exec(anchor?.getAttribute("href") ?? "")?.[1];
    if (!id) {
      continue;
    }
    const address = item.querySelector(".s-addr")?.textContent ?? "";
    cards.push({
      id,
      title: cleanText(anchor?.textContent),
      subtitle: cleanText(
        item.querySelector(".views-field-field-subtitle-1 .field-content")?.textContent,
      ),
      series: cleanText(item.querySelector(".sp-group a")?.textContent),
      hasAudio: MP3_SRC.test(address),
    });
  }

  return cards;
}

/** The last page the listing links to, or 1 when it is a single page. */
export function lastPageFrom(html: string): number {
  const root = parseHtml(html);
  let last = 1;
  for (const anchor of root.querySelectorAll('a[href*="page="]')) {
    const match = /[?&]page=(\d+)/.exec(anchor.getAttribute("href") ?? "");
    if (!match) {
      continue;
    }
    // The pager counts from zero, the listener from one.
    const page = Number(match[1]) + 1;
    if (Number.isInteger(page) && page > last) {
      last = page;
    }
  }
  return last;
}

function toCollection(card: SpokenCard): OnlineCollection | null {
  if (!card.title) {
    return null;
  }
  return {
    key: `${MESBAH_SOURCE.id}:${card.id}`,
    sourceId: MESBAH_SOURCE.id,
    externalId: card.id,
    title: card.title,
    subtitle: card.series ?? card.subtitle,
    artworkUrl: null,
    trackCount: 1,
    languageCode: MESBAH_SOURCE.languageCode,
    pageUrl: nodeUrl(card.id),
  };
}

async function listCollections(
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const firstHtml = await requestText(SPOKEN_URL, options.signal);
  const firstPage = parseSpokenCards(firstHtml);
  if (firstPage.length === 0) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }

  const lastPage = lastPageFrom(firstHtml);
  if (lastPage > MAX_PAGES) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }

  const cards = [...firstPage];
  if (lastPage > 1) {
    const numbers = Array.from({ length: lastPage - 1 }, (_, index) => index + 2);
    const pages = await mapWithConcurrency(numbers, PAGE_CONCURRENCY, async (page) => {
      const html = await requestText(pageUrl(page), options.signal);
      return parseSpokenCards(html);
    });
    for (const page of pages) {
      cards.push(...page);
    }
  }

  const seen = new Set<string>();
  const collections: OnlineCollection[] = [];
  for (const card of cards) {
    if (!card.hasAudio || seen.has(card.id)) {
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

/** One work, as its own page describes it. */
type SpokenWork = {
  id: string;
  title: string | null;
  streamUrl: string | null;
};

/** The work's title and recording, read off `/node/<id>`. */
export function parseSpokenWork(html: string, externalId: string): SpokenWork {
  const root = parseHtml(html);
  const title = cleanText(root.querySelector("h1")?.textContent);
  let streamUrl: string | null = null;
  for (const source of root.querySelectorAll("audio source")) {
    const match = MP3_SRC.exec(source.getAttribute("src") ?? "");
    if (match) {
      streamUrl = match[0];
      break;
    }
  }
  return { id: externalId, title, streamUrl };
}

async function loadWork(
  externalId: string,
  signal?: AbortSignal,
): Promise<SpokenWork | null> {
  if (!NUMERIC_ID.test(externalId)) {
    return null;
  }
  const html = await requestText(nodeUrl(externalId), signal);
  return parseSpokenWork(html, externalId);
}

async function getCollection(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  if (!NUMERIC_ID.test(externalId)) {
    return null;
  }
  let work: SpokenWork | null;
  try {
    work = await loadWork(externalId, options.signal);
  } catch (error) {
    if (error instanceof OnlineSourceError && error.code === "not_found") {
      return null;
    }
    throw error;
  }
  if (!work?.title) {
    return null;
  }
  return {
    key: `${MESBAH_SOURCE.id}:${externalId}`,
    sourceId: MESBAH_SOURCE.id,
    externalId,
    title: work.title,
    subtitle: null,
    artworkUrl: null,
    trackCount: 1,
    languageCode: MESBAH_SOURCE.languageCode,
    pageUrl: nodeUrl(externalId),
  };
}

/** `mesbah:7728` → `7728`. Throws when the key belongs to another source. */
function externalIdFromKey(collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== MESBAH_SOURCE.id) {
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
  const work = await loadWork(externalId, options.signal);
  // A one-track collection with no playable track is not a collection the
  // listener can do anything with; say it is gone rather than opening an empty
  // lecture.
  if (!work?.title || !work.streamUrl) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }
  return [
    {
      externalId,
      title: work.title,
      artist: null,
      albumTitle: null,
      artworkUrl: null,
      streamUrl: work.streamUrl,
      // The page states no duration; the player asks the file.
      durationSec: 0,
      order: 1,
      pageUrl: nodeUrl(externalId),
    },
  ];
}

export const mesbahAdapter: OnlineAdapter = {
  source: MESBAH_SOURCE,
  listCollections,
  getCollection,
  getTracks,
};
