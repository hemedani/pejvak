/**
 * The online-content registry.
 *
 * One place that answers "which sources exist, and who speaks for them", so no
 * screen ever constructs a source or reaches into an adapter directly. Adding a
 * provider means adding one adapter module and one line here.
 */

import type { DownloadState } from "@/lib/db/types";
import type { StatusSpec } from "@/lib/rowStatus";

import { aminikhaahAdapter } from "@/lib/online/aminikhaah";
import { aminikhaahPodcastsAdapter } from "@/lib/online/aminikhaahPodcasts";
import { archiveLanguageFacets, archiveSources, createArchiveAdapter } from "@/lib/online/archive";
import { librivoxAdapter } from "@/lib/online/librivox";
import { manahejAdapter } from "@/lib/online/manahej";
import { parseDownloadedFolderKey } from "@/lib/online/naming";
import { radioBrowserAdapter } from "@/lib/online/radiobrowser";
import type { OnlineAdapter, OnlineLanguage, OnlineSource, OnlineSourceKind } from "@/lib/online/types";

export * from "@/lib/online/languages";
export * from "@/lib/online/naming";
export * from "@/lib/online/series";
export * from "@/lib/online/types";

/**
 * Every registered provider, in the order the Browse tab offers them.
 *
 * The archive contributes one source per language rather than one source, so
 * this list is built rather than written: adding a language to the archive's own
 * table is the whole of what it takes for the Browse tab to offer it.
 */
export const SOURCES: readonly OnlineSource[] = [
  manahejAdapter.source,
  aminikhaahAdapter.source,
  aminikhaahPodcastsAdapter.source,
  librivoxAdapter.source,
  radioBrowserAdapter.source,
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

export function findSource(sourceId: string): OnlineSource | null {
  return SOURCES.find((source) => source.id === sourceId) ?? null;
}

/** The adapter for a source id, or null when nothing serves it. */
export function getAdapter(sourceId: string): OnlineAdapter | null {
  const source = findSource(sourceId);
  if (!source) {
    return null;
  }
  return ADAPTER_BUILDERS[source.kind](source);
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

/**
 * The string an online track's `content_hash` is derived from.
 *
 * A downloaded course and a streamed one must not become two different rows, so
 * identity is the source's own id for the item — never the URL, which is signed
 * and rotates.
 */
export function onlineIdentity(sourceId: string, externalId: string): string {
  return `online:${sourceId}:${externalId}`;
}

/**
 * What one of a source's collections is called, in the listener's words.
 *
 * A "collection" is our word; the listener browsing Manahej is looking at
 * categories, and an archive item is a shelf of files rather than a category.
 * The label is a property of the source, not of the download, so a future
 * provider with playlists names them here once.
 */
const COLLECTION_KIND_LABELS: Record<OnlineSourceKind, string> = {
  manahej: "Category",
  aminikhaah: "Series",
  aminikhaahpodcasts: "Episode",
  librivox: "Audiobook",
  radiobrowser: "Station",
  archive: "Collection",
};

/**
 * A downloaded folder's human label: `Manahej · Category · تاریخ شیعه`.
 *
 * The stored folder name is the title alone, which is what the on-disk folder
 * needs; the source and the kind are read back from the folder key so a rename
 * on the source, or a change to a source's display name, updates every folder
 * without rewriting rows or moving bytes. Keys that are not online folders are
 * returned untouched, so a device folder keeps exactly the name it had.
 */
export function describeDownloadedFolder(folderKey: string, title: string): string {
  const parsed = parseDownloadedFolderKey(folderKey);
  if (!parsed) {
    return title;
  }
  const source = findSource(parsed.sourceId);
  const sourceName = source?.name ?? parsed.sourceId;
  const kindLabel =
    parsed.kind === "series"
      ? "Series"
      : source
        ? COLLECTION_KIND_LABELS[source.kind]
        : "Collection";
  return `${sourceName} · ${kindLabel} · ${title}`;
}

/** "12 tracks" / "1 track". */
export function describeTrackCount(count: number): string {
  return `${count} track${count === 1 ? "" : "s"}`;
}

/**
 * The size line for a collection whose track count may not be known yet, or
 * null when there is nothing truthful to print.
 *
 * A source is not always able to state a collection's size before it is opened:
 * the Internet Archive's search index holds no per-item track count, so its
 * listings report `0` and the real figure is written the first time the
 * collection is opened. Rendering that as "0 tracks" would label a thirty-part
 * course as empty, so an unknown size prints nothing at all and the line fills
 * itself in on the next visit.
 */
export function describeKnownTrackCount(count: number): string | null {
  return count > 0 ? describeTrackCount(count) : null;
}

/**
 * The line under a collection's title: its grouping, then its known size.
 *
 * Either half can be absent — a source may not group its collections, and a
 * source may not state a size before the collection is opened — so the line is
 * built from whatever is true and is null when neither is. The grouping comes
 * first because it is what tells the listener *what* they are looking at; a
 * bare "0 tracks" would be worse than saying nothing.
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

/**
 * The words for a collection's download state, or null when there is nothing to
 * say.
 *
 * Shared rather than written per screen, because the same state is shown in the
 * source listing and on the Continue and Favorites cards — and three copies of
 * this switch would eventually disagree about what `cancelled` is called. The
 * glyph and the accent colour stay with the component that draws them; only the
 * wording lives here.
 *
 * `downloading` deliberately claims no progress. A card in a list holds no job
 * rows, and querying them per row to render "3 of 12" is exactly the
 * query-per-row the catalogue hooks exist to avoid — the collection screen is
 * where the numbers are.
 */
export function describeDownloadState(state: DownloadState | null | undefined): string | null {
  switch (state) {
    case "complete":
      return "Downloaded";
    case "downloading":
      return "Downloading";
    case "failed":
      return "Download failed";
    case "cancelled":
      return "Download paused";
    default:
      return null;
  }
}

/**
 * The same state as a row's one status line.
 *
 * The label still comes from `describeDownloadState`, so the two can never drift
 * apart; only the glyph kind is new. `cancelled` maps to `paused` because the
 * listener stopped it, and `failed` keeps its own kind so the line can be drawn
 * in the danger tone.
 */
export function describeDownloadStatus(
  state: DownloadState | null | undefined,
): StatusSpec | null {
  const label = describeDownloadState(state);
  if (!label) {
    return null;
  }
  switch (state) {
    case "complete":
      return { kind: "downloaded", label };
    case "downloading":
      return { kind: "downloading", label };
    case "failed":
      return { kind: "failed", label };
    case "cancelled":
      return { kind: "paused", label };
    default:
      return null;
  }
}
