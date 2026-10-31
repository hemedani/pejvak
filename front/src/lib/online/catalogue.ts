/**
 * The online catalogue: source metadata and the small pure helpers.
 *
 * Every source descriptor lives here rather than in its adapter, so the Browse
 * tab can render the shelf without importing a server-only module. The
 * adapters import their own descriptor back from this file; `registry.ts` is the
 * only place that knows how a source kind becomes a fetcher.
 *
 * Identity is the other half of this file. A collection key is
 * `${sourceId}:${externalId}` — never a URL, never a title — and an online
 * track's identity is the source's own id, never the signed address that
 * happens to serve it today.
 */

import { formatCount } from "@/lib/format";
import { archiveLanguageFacets, archiveSources } from "@/lib/online/archive-languages";

// Re-exported because it is part of the catalogue the UI reads, and because a
// caller should not have to know that the archive keeps its own table.
export { archiveSources };
import type {
  OnlineCollection,
  OnlineLanguage,
  OnlineSource,
  OnlineSourceKind,
} from "@/lib/online/types";

export const MANAHEJ_SOURCE: OnlineSource = {
  id: "manahej",
  kind: "manahej",
  name: "Manahej Radio",
  nativeName: "رادیو مناهج",
  languageCode: "fa",
  homepage: "https://manahej.ir",
  description: "Persian podcasts, book summaries and history series.",
};

export const AMINIKHAAH_SOURCE: OnlineSource = {
  id: "aminikhaah",
  kind: "aminikhaah",
  name: "Aminikhaah",
  nativeName: "پایگاه امینی خواه",
  languageCode: "fa",
  homepage: "https://aminikhaah.ir",
  description: "Persian lectures and book readings.",
  attribution: "Lectures by Hojjat al-Islam Amini-Khah, streamed from aminikhaah.ir.",
};

export const AMINIKHAAH_PODCASTS_SOURCE: OnlineSource = {
  id: "aminikhaah-podcasts",
  kind: "aminikhaahpodcasts",
  name: "Aminikhaah Podcasts",
  nativeName: "پادکست‌های امینی خواه",
  languageCode: "fa",
  homepage: "https://aminikhaah.ir/podcast",
  description: "Persian rowzeh podcast episodes, streamed from aminikhaah.ir.",
  attribution: "Podcasts by Hojjat al-Islam Amini-Khah, streamed from aminikhaah.ir.",
};

export const LIBRIVOX_SOURCE: OnlineSource = {
  id: "librivox",
  kind: "librivox",
  name: "LibriVox",
  nativeName: "LibriVox",
  languageCode: "de",
  languageCodes: ["de", "nl"],
  homepage: "https://librivox.org",
  description: "Public-domain audiobooks read by volunteers.",
  attribution: "Audiobooks from LibriVox, public domain.",
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

/**
 * Every registered provider, in the order the Browse tab offers them.
 *
 * The archive contributes one source per language rather than one source, so
 * this list is built rather than written: adding a language to the archive's own
 * table is the whole of what it takes for the Browse tab to offer it.
 */
export const SOURCES: readonly OnlineSource[] = [
  MANAHEJ_SOURCE,
  AMINIKHAAH_SOURCE,
  AMINIKHAAH_PODCASTS_SOURCE,
  LIBRIVOX_SOURCE,
  RADIO_BROWSER_SOURCE,
  ...archiveSources(),
];

/**
 * Every language a source serves.
 *
 * A source is usually one language and `languageCode` is that language. A
 * provider that serves several says so with `languageCodes`, and this is the
 * one place that answers the question — so a saved German book and a saved
 * Dutch book can come from the same provider without either losing its
 * language.
 */
export function sourceLanguages(source: OnlineSource): readonly string[] {
  return source.languageCodes && source.languageCodes.length > 0
    ? source.languageCodes
    : [source.languageCode];
}

/** Whether a source's audio is a live stream rather than a finite recording. */
export function isLiveSource(sourceId: string | null | undefined): boolean {
  return sourceId ? findSource(sourceId)?.live === true : false;
}

export function findSource(sourceId: string): OnlineSource | null {
  return SOURCES.find((source) => source.id === sourceId) ?? null;
}

export function sourcesForLanguage(languageCode: string): readonly OnlineSource[] {
  return SOURCES.filter((source) => sourceLanguages(source).includes(languageCode));
}

export type LanguageSearchField = "title" | "name" | "code" | "alias";

/**
 * What the Browse search can find a language by.
 *
 * The listener's own name is the title — it is the field they are reading —
 * the English name is how the catalogue is ordered, and the ISO codes are what
 * someone who knows the archive will type. A field with no value is `null`,
 * never `""`, because an empty string is a field every query matches.
 */
export function languageSearchFields(
  language: OnlineLanguage,
): readonly { field: LanguageSearchField; value: string | null }[] {
  const aliases = archiveLanguageFacets(language.code)
    .filter((facet) => facet !== language.name && facet !== language.code)
    .join(" ");
  return [
    { field: "title", value: language.nativeName || null },
    { field: "name", value: language.name || null },
    { field: "code", value: language.code || null },
    { field: "alias", value: aliases || null },
  ];
}

export type CollectionSearchField = "title" | "subtitle" | "source";

/** What the crate-level search can find a collection by, in priority order. */
export function collectionSearchFields(
  collection: OnlineCollection,
  sourceName: string,
): readonly { field: CollectionSearchField; value: string | null }[] {
  return [
    { field: "title", value: collection.title || null },
    { field: "subtitle", value: collection.subtitle || null },
    { field: "source", value: sourceName || null },
  ];
}

/** `${sourceId}:${externalId}` — a collection's identity everywhere in the app. */
export function collectionKey(sourceId: string, externalId: string): string {
  return `${sourceId}:${externalId}`;
}

/**
 * Split a collection key. Returns null rather than throwing: the key arrives
 * from a route param, which is user-reachable and therefore untrusted.
 */
export function parseCollectionKey(key: string): { sourceId: string; externalId: string } | null {
  const separator = key.indexOf(":");
  if (separator <= 0 || separator === key.length - 1) {
    return null;
  }
  return { sourceId: key.slice(0, separator), externalId: key.slice(separator + 1) };
}

/** `12 tracks` / `1 track` — English does inflect, so the count owns the word. */
export function describeTrackCount(count: number): string {
  return formatCount(Math.max(0, Math.floor(count)), "track");
}

/**
 * The size line for a collection whose track count may not be known yet, or
 * null when there is nothing truthful to print.
 *
 * A source is not always able to state a collection's size before it is opened:
 * the Internet Archive's search index holds no per-item track count, so its
 * listings report `0` and the real figure is known the first time the
 * collection is opened. Rendering that as "0 tracks" would label a thirty-part
 * course as empty, so an unknown size prints nothing at all.
 */
export function describeKnownTrackCount(count: number): string | null {
  return count > 0 ? describeTrackCount(count) : null;
}

/**
 * The line under a collection's title: its grouping, then its known size.
 *
 * Either half can be absent, so the line is built from whatever is true and is
 * null when neither is. The grouping comes first because it is what tells the
 * listener *what* they are looking at.
 */
export function describeCollectionLine(collection: {
  subtitle: string | null;
  trackCount: number;
}): string | null {
  const parts = [collection.subtitle, describeKnownTrackCount(collection.trackCount)].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** A short label for a source kind, for an overline where the source is clear. */
export function describeSourceKind(kind: OnlineSourceKind): string {
  switch (kind) {
    case "manahej":
      return "Category";
    case "aminikhaah":
      return "Collection";
    case "aminikhaahpodcasts":
      return "Episode";
    case "librivox":
      return "Audiobook";
    case "radiobrowser":
      return "Station";
    default:
      return "Collection";
  }
}

/** The document direction a title should be rendered in, by letter content. */
export function isRtlText(text: string): boolean {
  let rtl = 0;
  let ltr = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (
      (code >= 0x0590 && code <= 0x05ff) ||
      (code >= 0x0600 && code <= 0x06ff) ||
      (code >= 0x0750 && code <= 0x077f) ||
      (code >= 0x08a0 && code <= 0x08ff) ||
      (code >= 0xfb1d && code <= 0xfdff) ||
      (code >= 0xfe70 && code <= 0xfeff)
    ) {
      rtl += 1;
    } else if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) {
      ltr += 1;
    }
  }
  return rtl > 0 && rtl >= ltr;
}
