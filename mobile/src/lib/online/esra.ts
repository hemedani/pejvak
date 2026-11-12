/**
 * The esra.ir adapter — Ayatollah Javadi Amoli's lessons.
 *
 * The institute's portal is a Liferay site with no read API, but the three
 * lesson archives a listener actually wants are plain server-rendered pages,
 * and each of them is one series: the page lists its sessions, and each session
 * page carries the recording.
 *
 *   · `/web/javadi/آرشیو-دروس-تفسیر` — 55 sessions on Sūrat ar-Ra'd.
 *   · `/web/javadi/آرشیو-دروس-فقه` — the fiqh lessons (ḥudūd and diyāt).
 *   · `/web/javadi/آرشیو-دروس-اخلاق` — the ethics lessons.
 *
 * Two facts shape the adapter:
 *
 *   1. **A collection is an archive page, not a track.** The site has no notion
 *      of an album; it has an ordered list of sessions per subject, which is
 *      exactly what the app calls a collection.
 *   2. **The audio is only on the session page.** The archive lists titles and
 *      links and nothing else, so opening a series costs one request per
 *      session. That is the price of an archive with no index; it is bounded
 *      (`MAX_SESSIONS`) and fetched four at a time, so a 55-part series opens in
 *      a few seconds rather than a minute.
 *
 * The MP3s live on `mp3.esra.ir` over **plain HTTP**. That is the source's own
 * arrangement and there is no TLS listener to prefer — the app permits cleartext
 * for exactly this kind of case (`usesCleartextTraffic` in `app.json`), and a
 * rewrite to `https` would simply fail.
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

const BASE_URL = "https://esra.ir";

/**
 * The archives, in the order the Browse tab offers them.
 *
 * `path` is the Persian slug the portal uses, percent-encoded once here rather
 * than at every call site: a raw Persian path works in a browser and breaks in
 * a fetch on some Android builds.
 */
const SERIES = [
  {
    id: "tafsir",
    path: "/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D8%AA%D9%81%D8%B3%DB%8C%D8%B1",
    label: "دروس تفسیر",
    fallbackTitle: "تفسیر قرآن",
  },
  {
    id: "fiqh",
    path: "/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D9%81%D9%82%D9%87",
    label: "دروس فقه",
    fallbackTitle: "دروس فقه",
  },
  {
    id: "akhlaq",
    path: "/web/javadi/%D8%A2%D8%B1%D8%B4%DB%8C%D9%88-%D8%AF%D8%B1%D9%88%D8%B3-%D8%A7%D8%AE%D9%84%D8%A7%D9%82",
    label: "دروس اخلاق",
    fallbackTitle: "درس اخلاق",
  },
] as const;

type SeriesId = (typeof SERIES)[number]["id"];

/** How many session pages are read at once when a series is opened. */
const SESSION_CONCURRENCY = 4;
/**
 * A series larger than this is a changed page rather than a series. Bounding it
 * keeps one bad archive from turning an open into a crawl.
 */
const MAX_SESSIONS = 90;

const LESSON_HREF = /\/web\/javadi\/w\/([A-Za-z0-9_-]+)/;
const MP3_SRC = /(?:https?:)?\/\/[^\s"'<>]+\.mp3/i;

export const ESRA_SOURCE: OnlineSource = {
  id: "esra",
  kind: "esra",
  name: "Esra",
  nativeName: "بنیاد بین‌المللی اسراء",
  languageCode: "fa",
  homepage: BASE_URL,
  description: "Ayatollah Javadi Amoli's tafsir, fiqh and ethics lessons.",
  attribution: "Lessons by Ayatollah Javadi Amoli, streamed from esra.ir.",
};

function seriesById(id: string): (typeof SERIES)[number] | null {
  return SERIES.find((series) => series.id === id) ?? null;
}

function archiveUrl(series: (typeof SERIES)[number]): string {
  return `${BASE_URL}${series.path}`;
}

function lessonUrl(slug: string): string {
  return `${BASE_URL}/fa/web/javadi/w/${slug}`;
}

/** One session link from an archive page. */
type LessonLink = {
  slug: string;
  title: string;
};

/**
 * Every session the archive lists, deduplicated by slug.
 *
 * The list is rendered newest-first, which is the wrong order to listen in;
 * `inListeningOrder` puts it back.
 */
export function parseLessonLinks(html: string): LessonLink[] {
  const root = parseHtml(html);
  const bySlug = new Map<string, LessonLink>();
  for (const anchor of root.querySelectorAll('a[href*="/web/javadi/w/"]')) {
    const slug = LESSON_HREF.exec(anchor.getAttribute("href") ?? "")?.[1];
    if (!slug || bySlug.has(slug)) {
      continue;
    }
    const title = cleanText(anchor.textContent);
    if (!title) {
      continue;
    }
    bySlug.set(slug, { slug, title });
  }
  return [...bySlug.values()];
}

/** Persian and Arabic-Indic digits, which a title may use for its number. */
const DIGITS: Record<string, string> = {
  "۰": "0", "۱": "1", "۲": "2", "۳": "3", "۴": "4",
  "۵": "5", "۶": "6", "۷": "7", "۸": "8", "۹": "9",
  "٠": "0", "١": "1", "٢": "2", "٣": "3", "٤": "4",
  "٥": "5", "٦": "6", "٧": "7", "٨": "8", "٩": "9",
};

/** "جلسه ۱۲" → 12. Null when the title does not number its session. */
export function sessionNumber(title: string): number | null {
  const normalised = title.replace(/[۰-۹٠-٩]/g, (digit) => DIGITS[digit] ?? digit);
  const match = /جلسه\s*(\d{1,3})/.exec(normalised);
  if (!match) {
    return null;
  }
  const value = Number(match[1]);
  return Number.isInteger(value) && value > 0 ? value : null;
}

/**
 * The archive's sessions in the order they were taught.
 *
 * A numbered series sorts by its number; anything else keeps the page's own
 * order reversed, because the page is newest-first and a listener starting a
 * series wants the first session, not the last.
 */
export function inListeningOrder(lessons: readonly LessonLink[]): LessonLink[] {
  const numbered = lessons.every((lesson) => sessionNumber(lesson.title) !== null);
  if (numbered) {
    return [...lessons].sort(
      (a, b) => (sessionNumber(a.title) ?? 0) - (sessionNumber(b.title) ?? 0),
    );
  }
  return [...lessons].reverse();
}

/**
 * The series' own name, read off its session titles.
 *
 * A session is titled "تفسیر سوره رعد جلسه 3 (1362/02/12)", so everything before
 * "جلسه" is the series. The ethics lessons are titled only "جلسه درس اخلاق", and
 * fall back to the archive's own label.
 */
export function seriesTitleFrom(
  lessons: readonly LessonLink[],
  fallback: string,
): string {
  const first = lessons[0];
  if (!first) {
    return fallback;
  }
  const prefix = cleanText(first.title.split("جلسه")[0] ?? "") ?? "";
  return prefix.length >= 4 ? prefix : fallback;
}

/** The recording on a session page, or null when that session has none. */
export function parseLessonAudio(html: string): string | null {
  const root = parseHtml(html);
  const sources = root.querySelectorAll("audio source");
  for (const source of sources) {
    const src = source.getAttribute("src");
    const match = src ? MP3_SRC.exec(src) : null;
    if (match) {
      return match[0];
    }
  }
  // Some pages carry only the download link beside the player.
  const anchor = root.querySelector('a[href*=".mp3"]');
  const href = anchor?.getAttribute("href");
  return href ? (MP3_SRC.exec(href)?.[0] ?? null) : null;
}

async function fetchLessons(
  series: (typeof SERIES)[number],
  signal?: AbortSignal,
): Promise<LessonLink[]> {
  const html = await requestText(archiveUrl(series), signal);
  const lessons = parseLessonLinks(html);
  if (lessons.length === 0) {
    throw new OnlineSourceError("The source's archive has changed shape.", "invalid_response");
  }
  return lessons.slice(0, MAX_SESSIONS);
}

function toCollection(
  series: (typeof SERIES)[number],
  lessons: readonly LessonLink[],
): OnlineCollection {
  return {
    key: `${ESRA_SOURCE.id}:${series.id}`,
    sourceId: ESRA_SOURCE.id,
    externalId: series.id,
    title: seriesTitleFrom(lessons, series.fallbackTitle),
    subtitle: series.label,
    artworkUrl: null,
    trackCount: lessons.length,
    languageCode: ESRA_SOURCE.languageCode,
    pageUrl: archiveUrl(series),
  };
}

async function listCollections(
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const pages = await mapWithConcurrency(SERIES, 2, (series) =>
    fetchLessons(series, options.signal),
  );
  return SERIES.map((series, index) =>
    toCollection(series, pages[index] ?? []),
  );
}

async function getCollection(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  const series = seriesById(externalId);
  if (!series) {
    return null;
  }
  try {
    return toCollection(series, await fetchLessons(series, options.signal));
  } catch (error) {
    if (error instanceof OnlineSourceError && error.code === "not_found") {
      return null;
    }
    throw error;
  }
}

/** `esra:tafsir` → `tafsir`. Throws when the key belongs to another source. */
function seriesIdFromKey(collectionKey: string): SeriesId {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== ESRA_SOURCE.id) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  const series = seriesById(collectionKey.slice(separator + 1));
  if (!series) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }
  return series.id;
}

async function getTracks(
  collectionKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  const series = seriesById(seriesIdFromKey(collectionKey));
  if (!series) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }
  const lessons = inListeningOrder(await fetchLessons(series, options.signal));

  const audios = await mapWithConcurrency(lessons, SESSION_CONCURRENCY, async (lesson) => {
    try {
      const html = await requestText(lessonUrl(lesson.slug), options.signal);
      return parseLessonAudio(html);
    } catch (error) {
      // One unreadable session must not lose the other fifty-four: a series
      // with a gap is still worth listening to, and the gap says so by being
      // absent rather than by failing the whole open.
      if (options.signal?.aborted) {
        throw error;
      }
      return null;
    }
  });

  const tracks: OnlineTrack[] = [];
  lessons.forEach((lesson, index) => {
    const streamUrl = audios[index];
    if (!streamUrl) {
      return;
    }
    tracks.push({
      externalId: lesson.slug,
      title: lesson.title,
      artist: null,
      albumTitle: seriesTitleFrom(lessons, series.fallbackTitle),
      artworkUrl: null,
      streamUrl,
      // The archive states no duration; the player asks the file.
      durationSec: 0,
      order: tracks.length + 1,
      pageUrl: lessonUrl(lesson.slug),
    });
  });

  if (tracks.length === 0) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }
  return tracks;
}

export const esraAdapter: OnlineAdapter = {
  source: ESRA_SOURCE,
  listCollections,
  getCollection,
  getTracks,
};
