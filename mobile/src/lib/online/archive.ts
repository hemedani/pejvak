/**
 * The Internet Archive adapter.
 *
 * archive.org is a public library: millions of audio items, uploaded by
 * institutions and by individuals, free to stream and free to download. It is
 * the second source, and it is the one that makes the language list mean
 * something — it holds audio in every language the catalogue offers, not just
 * Persian.
 *
 * Unlike manahej.ir it publishes a real, documented, read-only API, so there is
 * nothing to scrape:
 *
 *   · Search — `/advancedsearch.php?q=…&output=json` returns matching items with
 *     whichever fields you ask for. No per-item track count is indexed.
 *   · Item — `/metadata/<identifier>` returns the item's file list and metadata.
 *   · Artwork — `/services/img/<identifier>` is a real JPEG.
 *   · Audio — `/download/<identifier>/<file name>` redirects to a storage node.
 *
 * Four things about this source are worth knowing before reading the code,
 * because each one is a bug that has already been paid for once:
 *
 *   1. **A language is not one facet value.** The archive files an item under
 *      its English name (`Persian`) *or* its ISO 639-2 code (`per`, `fas`), and
 *      the three sets are disjoint: `Persian` alone matches 91 items, while the
 *      union matches 2,194 — and the most-downloaded Persian item of all
 *      (`radioDaal`, 1.2 million downloads) is filed only under `per`. So a
 *      language is queried as an OR across every spelling it is known by, and
 *      that list lives in `ARCHIVE_LANGUAGES`.
 *   2. **`length` mixes two units inside one item.** The same response holds
 *      `"20:45"` and `"472.77"` side by side: a colon string is `MM:SS`, a bare
 *      number is already seconds. `MM:SS` is *minutes*, not hours — the longest
 *      observed first component is 109 — so it is parsed as such and never as
 *      `HH:MM:SS`. `parseArchiveDuration` is total: anything it cannot read with
 *      confidence becomes `0`, because a wrong duration is worse than none.
 *   3. **`track` cannot be trusted to order an item.** It arrives as `"01"`,
 *      `"003"`, `"5"` and `"0000"` in the same item; 92 of the 104 files in one
 *      Persian item carry none at all; and one item's introduction claims the
 *      *same* track number as its first episode while sitting last in the file
 *      list. Ordering by it scrambles a collection. The numbers in the file's
 *      name are the reliable signal, with the track number and then the listing
 *      position behind it — see `orderKey`.
 *   4. **`creator`, `title` and `language` may be a string or an array** — the
 *      archive sends an array as soon as an item has more than one value.
 *      `asString` handles both.
 *
 * One contrast with manahej.ir that simplifies everything downstream: these
 * stream URLs do **not** expire. `/download/<id>/<name>` is a stable redirect,
 * so a stored URL is still playable next month and a download does not have to
 * re-resolve the collection first.
 */

import { cleanText } from "@/lib/online/text";
import { requestJson } from "@/lib/online/transport";
import {
  OnlineSourceError,
  type OnlineAdapter,
  type OnlineCollection,
  type OnlineSource,
  type OnlineTrack,
} from "@/lib/online/types";

const BASE_URL = "https://archive.org";
const SEARCH_URL = `${BASE_URL}/advancedsearch.php`;
const METADATA_URL = `${BASE_URL}/metadata`;
const DOWNLOAD_URL = `${BASE_URL}/download`;
const ARTWORK_URL = `${BASE_URL}/services/img`;
const DETAILS_URL = `${BASE_URL}/details`;

/** The slug prefix every language's source id carries: `archive-fa`. */
const SOURCE_PREFIX = "archive-";

/**
 * How many collections a language's browse list shows.
 *
 * The archive holds millions of items, so "all of them" is not a list — it is a
 * search engine. The most-downloaded few are the closest thing the archive has
 * to an editorial selection, which is what a browse tab is for.
 */
const BROWSE_ROWS = 40;

/**
 * The format filter, as a bare Lucene token rather than the full label.
 *
 * An item's playable MP3s are labelled `VBR MP3`, `128Kbps MP3` or `64Kbps MP3`
 * depending on when and how they were derived, and a handful of Persian items
 * carry only a non-VBR variant. Matching the token `mp3` catches all of them
 * where matching the string `VBR MP3` would silently hide those items.
 */
const PLAYABLE_FORMAT = "mp3";

/**
 * A language, as the archive files it.
 *
 * `facets` is every spelling the archive uses for this language, and it is a
 * list rather than a name because the archive's own vocabulary is inconsistent:
 * see the note on facet values at the top of this file. A language is missing
 * from the browse list unless it appears here.
 */
type ArchiveLanguage = {
  /** Our code, and the language's half of the source id (`archive-fa`). */
  code: string;
  /** The name the archive indexes this language under, for display. */
  name: string;
  /** The English name, the ISO 639-1 code, and both ISO 639-2 codes. */
  facets: readonly string[];
};

/**
 * Every language the archive can serve, with the facets verified against the
 * live search API.
 *
 * Ordered by our own language code, which is the ISO 639-1 code for all of
 * them. Where ISO 639-2 has two forms — a bibliographic one (`per`) and a
 * terminology one (`fas`) — both are listed, because the archive uses both.
 */
const ARCHIVE_LANGUAGES: readonly ArchiveLanguage[] = [
  { code: "ar", name: "Arabic", facets: ["Arabic", "ar", "ara"] },
  { code: "az", name: "Azerbaijani", facets: ["Azerbaijani", "az", "aze"] },
  { code: "bn", name: "Bengali", facets: ["Bengali", "bn", "ben"] },
  { code: "my", name: "Burmese", facets: ["Burmese", "my", "bur", "mya"] },
  { code: "zh", name: "Chinese", facets: ["Chinese", "zh", "chi", "zho"] },
  { code: "cs", name: "Czech", facets: ["Czech", "cs", "cze", "ces"] },
  { code: "da", name: "Danish", facets: ["Danish", "da", "dan"] },
  { code: "nl", name: "Dutch", facets: ["Dutch", "nl", "dut", "nld"] },
  { code: "en", name: "English", facets: ["English", "en", "eng"] },
  { code: "fi", name: "Finnish", facets: ["Finnish", "fi", "fin"] },
  { code: "fr", name: "French", facets: ["French", "fr", "fre", "fra"] },
  { code: "de", name: "German", facets: ["German", "de", "ger", "deu"] },
  { code: "el", name: "Greek", facets: ["Greek", "el", "gre", "ell"] },
  { code: "he", name: "Hebrew", facets: ["Hebrew", "he", "heb"] },
  { code: "hi", name: "Hindi", facets: ["Hindi", "hi", "hin"] },
  { code: "hu", name: "Hungarian", facets: ["Hungarian", "hu", "hun"] },
  { code: "id", name: "Indonesian", facets: ["Indonesian", "id", "ind"] },
  { code: "it", name: "Italian", facets: ["Italian", "it", "ita"] },
  { code: "ja", name: "Japanese", facets: ["Japanese", "ja", "jpn"] },
  { code: "kk", name: "Kazakh", facets: ["Kazakh", "kk", "kaz"] },
  { code: "ko", name: "Korean", facets: ["Korean", "ko", "kor"] },
  { code: "ku", name: "Kurdish", facets: ["Kurdish", "ku", "kur"] },
  { code: "ms", name: "Malay", facets: ["Malay", "ms", "may", "msa"] },
  { code: "ml", name: "Malayalam", facets: ["Malayalam", "ml", "mal"] },
  { code: "mr", name: "Marathi", facets: ["Marathi", "mr", "mar"] },
  { code: "no", name: "Norwegian", facets: ["Norwegian", "no", "nor"] },
  { code: "ps", name: "Pashto", facets: ["Pashto", "ps", "pus"] },
  { code: "fa", name: "Persian", facets: ["Persian", "fa", "per", "fas"] },
  { code: "pl", name: "Polish", facets: ["Polish", "pl", "pol"] },
  { code: "pt", name: "Portuguese", facets: ["Portuguese", "pt", "por"] },
  { code: "pa", name: "Punjabi", facets: ["Punjabi", "pa", "pan"] },
  { code: "ro", name: "Romanian", facets: ["Romanian", "ro", "rum", "ron"] },
  { code: "ru", name: "Russian", facets: ["Russian", "ru", "rus"] },
  { code: "sr", name: "Serbian", facets: ["Serbian", "sr", "srp"] },
  { code: "si", name: "Sinhala", facets: ["Sinhala", "si", "sin"] },
  { code: "es", name: "Spanish", facets: ["Spanish", "es", "spa"] },
  { code: "sv", name: "Swedish", facets: ["Swedish", "sv", "swe"] },
  { code: "tl", name: "Tagalog", facets: ["Tagalog", "tl", "tgl"] },
  { code: "ta", name: "Tamil", facets: ["Tamil", "ta", "tam"] },
  { code: "te", name: "Telugu", facets: ["Telugu", "te", "tel"] },
  { code: "th", name: "Thai", facets: ["Thai", "th", "tha"] },
  { code: "tr", name: "Turkish", facets: ["Turkish", "tr", "tur"] },
  { code: "uk", name: "Ukrainian", facets: ["Ukrainian", "uk", "ukr"] },
  { code: "ur", name: "Urdu", facets: ["Urdu", "ur", "urd"] },
  { code: "uz", name: "Uzbek", facets: ["Uzbek", "uz", "uzb"] },
  { code: "vi", name: "Vietnamese", facets: ["Vietnamese", "vi", "vie"] },
];

/** The language codes this source serves — read by the language catalogue. */
export const ARCHIVE_LANGUAGE_CODES: ReadonlySet<string> = new Set(
  ARCHIVE_LANGUAGES.map((language) => language.code),
);

/**
 * One source per language, rather than one source that changes language.
 *
 * A source is a fixed piece of data and its id is baked into every collection
 * key the listener saves, so a single `archive` source would either have to
 * carry a language that changes under it or lose the language from a saved
 * course's identity. One source per language keeps both stable: a course saved
 * from the Persian list stays a Persian course.
 */
export function archiveSources(): OnlineSource[] {
  return ARCHIVE_LANGUAGES.map((language) => ({
    id: `${SOURCE_PREFIX}${language.code}`,
    kind: "archive",
    name: "Internet Archive",
    nativeName: "Internet Archive",
    languageCode: language.code,
    homepage: `${BASE_URL}/search?query=${encodeURIComponent(`language:("${language.name}")`)}`,
    description: `Public audio in ${language.name}, free to stream or download.`,
  }));
}

/**
 * The length of an archive file, in whole seconds, or `0` when unreadable.
 *
 * Total by design. The archive stores this field as a bare number of seconds
 * (`"472.77"`) for some files and as `MM:SS` (`"20:45"`) for others, in the same
 * item, and `MM:SS` can exceed an hour (`"109:30"` is 109 minutes). A value this
 * function cannot parse confidently becomes `0`, which the app already treats as
 * "unknown, ask the player" — the alternative is writing a duration that is
 * wrong by a factor of sixty, which would corrupt every statistic derived from
 * it and cannot be detected afterwards.
 */
export function parseArchiveDuration(value: unknown): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  if (typeof value !== "string") {
    return 0;
  }
  const text = value.trim();
  if (text.length === 0) {
    return 0;
  }

  if (text.includes(":")) {
    const parts = text.split(":");
    // `MM:SS` is what this source emits; `H:MM:SS` is accepted because it is
    // unambiguous, even though it has not been observed. Anything longer is
    // some other notation and is refused rather than guessed at.
    if (parts.length < 2 || parts.length > 3) {
      return 0;
    }
    let total = 0;
    for (const part of parts) {
      if (!/^\d+$/.test(part)) {
        return 0;
      }
      total = total * 60 + Number(part);
    }
    return total > 0 ? total : 0;
  }

  if (!/^\d+(\.\d+)?$/.test(text)) {
    return 0;
  }
  const seconds = Number(text);
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0;
}

/** One item in a search response. Only the fields we ask for. */
type ArchiveSearchDoc = {
  identifier?: unknown;
  title?: unknown;
  creator?: unknown;
};

type ArchiveSearchResponse = {
  response?: { docs?: unknown };
};

/** One entry of an item's file list. Only the fields we read. */
type ArchiveFile = {
  name?: unknown;
  title?: unknown;
  artist?: unknown;
  track?: unknown;
  length?: unknown;
};

type ArchiveMetadataResponse = {
  files?: unknown;
  metadata?: unknown;
};

/** A mapped track, before its position inside the collection is assigned. */
type MappedTrack = Omit<OnlineTrack, "order">;

/** The query a language's browse list runs. */
function browseQuery(language: ArchiveLanguage): string {
  const languages = language.facets.map((facet) => `language:("${facet}")`).join(" OR ");
  return `mediatype:(audio) AND (${languages}) AND format:("${PLAYABLE_FORMAT}")`;
}

function artworkUrl(identifier: string): string {
  return `${ARTWORK_URL}/${encodeURIComponent(identifier)}`;
}

function detailsUrl(identifier: string): string {
  return `${DETAILS_URL}/${encodeURIComponent(identifier)}`;
}

function streamUrl(identifier: string, fileName: string): string {
  return `${DOWNLOAD_URL}/${encodeURIComponent(identifier)}/${encodeURIComponent(fileName)}`;
}

/**
 * Whether a file list entry is an MP3 we can actually stream.
 *
 * The extension is the test, not the `format` label: one file in the Persian
 * collection is labelled `Ogg Vorbis` while being an `.mp3`, so trusting the
 * label would drop a playable track. A name containing `/` is a path rather
 * than a file in the item, and would not survive being encoded into a URL.
 */
function isPlayableName(name: unknown): name is string {
  return (
    typeof name === "string" &&
    name.length > 0 &&
    !name.includes("/") &&
    /\.mp3$/i.test(name)
  );
}

/** `"01"` / `"003"` / `"5"` / `"0000"` → a number; anything else → null. */
function parseTrackNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return Number.isInteger(value) && value >= 0 ? value : null;
  }
  if (typeof value !== "string") {
    return null;
  }
  const text = value.trim();
  return /^\d+$/.test(text) ? Number(text) : null;
}

/**
 * The numbers inside a file name, in the order they appear.
 *
 * `"ep_9.mp3"` must sort before `"ep_10.mp3"`, and a name carrying several
 * numbers (`"001_15.09.08_FarsiReadings.mp3"`) carries its order in the first of
 * them. Comparing them as numbers in sequence gives back the order the uploader
 * wrote into the name.
 *
 * The extension is stripped first, and that is not cosmetic: `".mp3"` itself
 * contains a digit, so leaving it in gives every file in the item a spurious
 * trailing `3`. That is harmless while all the names carry the same number of
 * digits and wrong as soon as they do not — `"f_none.mp3"` would yield `[3]`
 * and sort *before* `"d_003.mp3"`'s `[3, 3]`.
 */
function nameNumbers(name: string): number[] {
  const stem = name.replace(/\.[a-z0-9]+$/i, "");
  const runs = stem.match(/\d+/g);
  return runs === null ? [] : runs.map(Number);
}

/** Compare two number runs element by element. */
function compareNumberRuns(left: number[], right: number[]): number {
  // A name with no numbers at all is the weakest possible signal, so it sorts
  // after one that has them rather than displacing it.
  if (left.length === 0 || right.length === 0) {
    return right.length - left.length;
  }
  const shared = Math.min(left.length, right.length);
  for (let position = 0; position < shared; position += 1) {
    const difference = (left[position] ?? 0) - (right[position] ?? 0);
    if (difference !== 0) {
      return difference;
    }
  }
  return left.length - right.length;
}

/** Everything the ordering of one file is decided from. */
type OrderKey = {
  name: string;
  /** The stated track number, or null when the archive gives none. */
  track: number | null;
  /** Where the archive listed the file. */
  index: number;
};

function orderKey(file: ArchiveFile, index: number): OrderKey {
  return {
    name: typeof file.name === "string" ? file.name : "",
    track: parseTrackNumber(file.track),
    index,
  };
}

/**
 * The order two files should play in.
 *
 * Three signals, in the order they can be trusted:
 *
 *   1. **The numbers in the file's name.** This is the one that works. The
 *      archive's `track` field fails in both directions — most files in a long
 *      item carry none, and one item's introduction claims the same track number
 *      as its first episode while sitting at the very end of the file list. The
 *      name gets both right.
 *   2. **The stated track number**, for an item whose names carry no numbers.
 *   3. **The position the archive listed the file in.**
 *
 * Mixing 1 and 2 in a single key space is what this replaces: a track number
 * runs 1…102 while a raw file index runs to 657 on the same item, because the
 * non-audio derivatives sit between the audio files, so the two interleaved and
 * the episodes came out shuffled.
 */
function compareOrder(left: OrderKey, right: OrderKey): number {
  const byName = compareNumberRuns(nameNumbers(left.name), nameNumbers(right.name));
  if (byName !== 0) {
    return byName;
  }
  const leftTrack = left.track ?? Number.MAX_SAFE_INTEGER;
  const rightTrack = right.track ?? Number.MAX_SAFE_INTEGER;
  if (leftTrack !== rightTrack) {
    return leftTrack - rightTrack;
  }
  return left.index - right.index;
}

/** A readable title from a file name, for files the archive gave none. */
function titleFromFileName(name: string): string {
  const stem = name.replace(/\.[a-z0-9]+$/i, "");
  const spaced = stem.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  return spaced.length > 0 ? spaced : name;
}

/** The item-level facts every track in a collection shares. */
type TrackContext = {
  identifier: string;
  creator: string | null;
  albumTitle: string | null;
  artworkUrl: string;
  pageUrl: string;
};

function mapTrack(file: ArchiveFile, context: TrackContext): MappedTrack | null {
  const name = file.name;
  if (typeof name !== "string") {
    return null;
  }
  return {
    // The file's own name inside the item is the stable identity. It is not the
    // URL: the archive serves the same file from whichever node is nearest, so
    // the URL's host changes while the name does not.
    externalId: name,
    title: cleanText(file.title) ?? titleFromFileName(name),
    artist: cleanText(file.artist) ?? context.creator,
    albumTitle: context.albumTitle,
    artworkUrl: context.artworkUrl,
    streamUrl: streamUrl(context.identifier, name),
    durationSec: parseArchiveDuration(file.length),
    pageUrl: context.pageUrl,
  };
}

/** `archive-fa:hezaroiekshab` → `hezaroiekshab`. */
function externalIdFromKey(sourceId: string, collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== sourceId) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  const externalId = collectionKey.slice(separator + 1);
  if (externalId.length === 0) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  return externalId;
}

/**
 * An adapter for one language of the archive.
 *
 * Built per source rather than shared, because the language is not a parameter
 * of any of these calls — it is the identity of the source itself.
 */
export function createArchiveAdapter(source: OnlineSource): OnlineAdapter {
  const language = ARCHIVE_LANGUAGES.find((entry) => entry.code === source.languageCode);
  if (!language) {
    throw new OnlineSourceError("That source has no language set.", "invalid_response");
  }

  // The query is a constant for this adapter's whole life, so it is built once
  // here rather than on every browse.
  const query = browseQuery(language);

  async function listCollections(
    options: { signal?: AbortSignal } = {},
  ): Promise<OnlineCollection[]> {
    const url =
      `${SEARCH_URL}?q=${encodeURIComponent(query)}` +
      `&fl[]=identifier&fl[]=title&fl[]=creator` +
      `&rows=${BROWSE_ROWS}&page=1` +
      `&sort[]=${encodeURIComponent("downloads desc")}` +
      `&output=json`;

    const body = await requestJson<ArchiveSearchResponse>(url, options.signal);
    const docs = body.response?.docs;
    if (!Array.isArray(docs)) {
      // An empty result is a legitimate answer for a language with nothing in
      // it, but a response with no `docs` array at all is a different shape than
      // the API documents, and saying so is better than reporting "no results".
      throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
    }

    const collections: OnlineCollection[] = [];
    for (const entry of docs) {
      const doc: ArchiveSearchDoc =
        typeof entry === "object" && entry !== null ? (entry as ArchiveSearchDoc) : {};
      const identifier = cleanText(doc.identifier);
      const title = cleanText(doc.title);
      // An item with no id cannot be opened and one with no title would render
      // as a nameless row, so both are dropped rather than shown as broken.
      if (!identifier || !title) {
        continue;
      }
      collections.push({
        key: `${source.id}:${identifier}`,
        sourceId: source.id,
        externalId: identifier,
        title,
        subtitle: cleanText(doc.creator),
        artworkUrl: artworkUrl(identifier),
        // The search index has no per-item track count, and the only field that
        // looks like one (`files_count`) counts every derivative as well — 227
        // files for a 35-lecture course. So the size is reported as unknown and
        // the real figure is written the first time the collection is opened.
        trackCount: 0,
        languageCode: source.languageCode,
        pageUrl: detailsUrl(identifier),
      });
    }
    return collections;
  }

  async function getTracks(
    collectionKey: string,
    options: { signal?: AbortSignal } = {},
  ): Promise<OnlineTrack[]> {
    const identifier = externalIdFromKey(source.id, collectionKey);
    const body = await requestJson<ArchiveMetadataResponse>(
      `${METADATA_URL}/${encodeURIComponent(identifier)}`,
      options.signal,
    );

    if (!Array.isArray(body.files)) {
      // A removed or renamed identifier is answered with `200` and an empty
      // object, so "there is no file list" is the only signal that it is gone.
      throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
    }

    const metadata =
      typeof body.metadata === "object" && body.metadata !== null
        ? (body.metadata as Record<string, unknown>)
        : {};

    const context: TrackContext = {
      identifier,
      creator: cleanText(metadata.creator),
      albumTitle: cleanText(metadata.title),
      artworkUrl: artworkUrl(identifier),
      pageUrl: detailsUrl(identifier),
    };

    const ordered = body.files
      .map((entry): ArchiveFile =>
        typeof entry === "object" && entry !== null ? (entry as ArchiveFile) : {},
      )
      // The index is captured before filtering, so a file with no track number
      // still falls back to the position it held in the source's own listing.
      .map((file, index) => ({ file, index }))
      .filter((entry) => isPlayableName(entry.file.name))
      .sort((left, right) =>
        compareOrder(
          orderKey(left.file, left.index),
          orderKey(right.file, right.index),
        ),
      );

    const tracks: MappedTrack[] = [];
    for (const entry of ordered) {
      const track = mapTrack(entry.file, context);
      if (track) {
        tracks.push(track);
      }
    }

    // Renumbered densely from one: the position is what a download's file name
    // is built from, so a dropped or unnumbered file must not leave a hole.
    return tracks.map((track, index) => ({ ...track, order: index + 1 }));
  }

  return { source, listCollections, getTracks };
}
