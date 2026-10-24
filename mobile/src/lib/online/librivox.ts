/**
 * The LibriVox adapter.
 *
 * LibriVox is a volunteer library of public-domain audiobooks. Its catalogue is
 * served by a documented, keyless API:
 *
 *   · Books — `/api/feed/audiobooks/?format=json` returns projects, with
 *     `extended=1` adding sections and `coverart=1` adding a cover.
 *   · Tracks — `/api/feed/audiotracks/?project_id=<id>&format=json` returns the
 *     project's chapters in one list.
 *
 * Two facts shape the implementation:
 *
 *   1. **The API has no language filter.** `language=German` is accepted and
 *      silently ignored — the first page is the same English books whichever
 *      language is asked for. So a language is applied on the client: browse
 *      walks a bounded number of pages and keeps only matching projects, while
 *      search narrows by title/author first and filters the results the same
 *      way.
 *   2. **A project's own id is the identity.** `id` is the audiobook's stable
 *      LibriVox id and a section's `id` is the chapter's; the audio URL points at
 *      archive.org and is only a cache of where the bytes are today.
 *
 * Durations are already whole seconds (`playtime: "611"`), and
 * `num_sections` gives a browsing card a real track count before it is opened.
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

const API_URL = "https://librivox.org/api/feed/audiobooks/";
const TRACKS_URL = "https://librivox.org/api/feed/audiotracks/";
const BASE_URL = "https://librivox.org";

/** How many audiobooks a language's browse list shows. */
const BROWSE_ROWS = 40;
/** The API's per-request maximum (500 since September 2026). */
const PAGE_SIZE = 500;
/**
 * How many catalogue pages a browse will walk looking for one language.
 *
 * The catalogue is dominated by English, and German/Dutch appear at roughly
 * 4% and 1% of a page respectively. Six pages is enough for German to fill a
 * browse list and for Dutch to return a useful shelf, while keeping a cold
 * browse to a handful of bounded requests. The catalogue is memoised for five
 * minutes by `OnlineCatalogService`, so this is not a per-screen cost.
 */
const MAX_SCAN_PAGES = 6;
/** Search results are capped lower: a query is a list, not a catalogue. */
const SEARCH_ROWS = 40;
const SEARCH_PAGE_SIZE = 100;

/** The language names the LibriVox catalogue files a reading under. */
const LANGUAGE_NAMES: Readonly<Record<string, string>> = {
  de: "German",
  nl: "Dutch",
};

const CODE_BY_NAME: Readonly<Record<string, string>> = {
  german: "de",
  dutch: "nl",
};

export const LIBRIVOX_SOURCE: OnlineSource = {
  id: "librivox",
  kind: "librivox",
  name: "LibriVox",
  nativeName: "LibriVox",
  languageCode: "de",
  languageCodes: ["de", "nl"],
  homepage: BASE_URL,
  description: "Public-domain audiobooks read by volunteers.",
  attribution: "Audiobooks from LibriVox, public domain.",
};

const idSchema = z.union([z.string(), z.number()]);
const countSchema = z.union([z.string(), z.number()]);

const authorSchema = z
  .object({
    first_name: z.string().nullish(),
    last_name: z.string().nullish(),
  })
  .passthrough();

/**
 * One project. Unknown fields are allowed: the API grows fields without warning
 * and a strict object would turn that into an outage. Only the fields read here
 * are required to have the right shape.
 */
const bookSchema = z
  .object({
    id: idSchema,
    title: z.string().nullish(),
    language: z.string().nullish(),
    num_sections: countSchema.nullish(),
    totaltimesecs: z.number().nullish(),
    url_librivox: z.string().nullish(),
    coverart_thumbnail: z.string().nullish(),
    coverart_jpg: z.string().nullish(),
    authors: z.array(authorSchema).nullish(),
  })
  .passthrough();

const booksResponseSchema = z
  .object({
    books: z.array(z.unknown()).nullish(),
  })
  .passthrough();

const sectionSchema = z
  .object({
    id: idSchema,
    section_number: countSchema.nullish(),
    title: z.string().nullish(),
    listen_url: z.string().nullish(),
    playtime: countSchema.nullish(),
  })
  .passthrough();

const sectionsResponseSchema = z
  .object({
    sections: z.array(z.unknown()).nullish(),
  })
  .passthrough();

type Book = z.infer<typeof bookSchema>;
type Section = z.infer<typeof sectionSchema>;

function isHttpUrl(value: string | null): value is string {
  if (!value) {
    return false;
  }
  return /^https?:\/\//i.test(value.trim());
}

function cleanedUrl(value: unknown): string | null {
  const text = cleanText(value);
  return isHttpUrl(text) ? text : null;
}

function idOf(value: string | number): string | null {
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function parseCount(value: string | number | null | undefined): number {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? Math.round(value) : 0;
  }
  if (typeof value !== "string" || !/^\d+$/.test(value.trim())) {
    return 0;
  }
  const parsed = Number(value.trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : 0;
}

function authorNames(book: Book): string | null {
  const names: string[] = [];
  for (const author of book.authors ?? []) {
    const name = [cleanText(author.first_name), cleanText(author.last_name)]
      .filter((part): part is string => part !== null)
      .join(" ")
      .trim();
    if (name.length > 0) {
      names.push(name);
    }
  }
  return names.length > 0 ? names.join(", ") : null;
}

/**
 * One project as the app's collection, or null when the requested language does
 * not match or the record cannot be opened.
 *
 * `requestedLanguage` is the language the listener chose. It is compared against
 * the project's own `language`, never inferred from the query, because the API
 * ignores the query's language parameter entirely.
 */
function mapBook(raw: unknown, requestedLanguage?: string): OnlineCollection | null {
  const parsed = bookSchema.safeParse(raw);
  if (!parsed.success) {
    return null;
  }
  const book = parsed.data;
  const externalId = idOf(book.id);
  const title = cleanText(book.title);
  if (!externalId || !title) {
    return null;
  }

  const languageName = cleanText(book.language);
  const actualCode = languageName ? CODE_BY_NAME[languageName.toLowerCase()] : undefined;
  if (requestedLanguage && actualCode !== requestedLanguage) {
    return null;
  }
  const languageCode = actualCode ?? requestedLanguage ?? LIBRIVOX_SOURCE.languageCode;
  if (!languageCode) {
    return null;
  }

  const cover =
    cleanedUrl(book.coverart_thumbnail) ?? cleanedUrl(book.coverart_jpg) ?? null;

  return {
    key: `${LIBRIVOX_SOURCE.id}:${externalId}`,
    sourceId: LIBRIVOX_SOURCE.id,
    externalId,
    title,
    subtitle: authorNames(book),
    artworkUrl: cover,
    // A project states its chapter count up front, unlike the archive. A
    // project that states zero (an index page) is still a real row; the count
    // simply renders as unknown until it is opened.
    trackCount: parseCount(book.num_sections),
    languageCode,
    pageUrl: cleanedUrl(book.url_librivox),
  };
}

function parseBooks(body: unknown): unknown[] {
  const parsed = booksResponseSchema.safeParse(body);
  if (!parsed.success || !Array.isArray(parsed.data.books)) {
    throw new OnlineSourceError("The source's catalogue has changed shape.", "invalid_response");
  }
  return parsed.data.books;
}

function booksUrl(parameters: Record<string, string | number>): string {
  const query = new URLSearchParams({
    format: "json",
    fields: [
      "id",
      "title",
      "language",
      "authors",
      "num_sections",
      "url_librivox",
      "totaltimesecs",
      "coverart_thumbnail",
      "coverart_jpg",
    ].join(","),
    coverart: "1",
    ...Object.fromEntries(
      Object.entries(parameters).map(([key, value]) => [key, String(value)]),
    ),
  });
  return `${API_URL}?${query.toString()}`;
}

async function listCollections(options: OnlineListOptions = {}): Promise<OnlineCollection[]> {
  const languageCode = options.languageCode ?? LIBRIVOX_SOURCE.languageCode;
  const languageName = LANGUAGE_NAMES[languageCode];
  if (!languageName) {
    return [];
  }

  const collections: OnlineCollection[] = [];
  let offset = 0;

  for (let page = 0; page < MAX_SCAN_PAGES; page += 1) {
    const body = await requestJson<unknown>(
      booksUrl({ limit: PAGE_SIZE, offset, sort_order: "asc" }),
      options.signal,
    );
    const books = parseBooks(body);

    for (const raw of books) {
      const collection = mapBook(raw, languageCode);
      if (collection) {
        collections.push(collection);
      }
      if (collections.length >= BROWSE_ROWS) {
        break;
      }
    }

    // A short page is the end of the catalogue; a full page with enough matches
    // is the end of this browse. Either way there is nothing left to ask for.
    if (books.length < PAGE_SIZE || collections.length >= BROWSE_ROWS) {
      break;
    }
    offset += PAGE_SIZE;
  }

  return collections.slice(0, BROWSE_ROWS);
}

async function searchCollections(
  query: string,
  options: OnlineListOptions = {},
): Promise<OnlineCollection[]> {
  const text = query.trim();
  if (text.length === 0) {
    return [];
  }
  const languageCode = options.languageCode ?? LIBRIVOX_SOURCE.languageCode;

  // The API searches one field at a time, and a listener who types "Dumas" means
  // the author while one who types "Schuss" means the title. Asking both and
  // merging is the only way to honour either without a query-language parser.
  const fields = ["title", "author"] as const;
  const responses = await Promise.allSettled(
    fields.map((field) =>
      requestJson<unknown>(
        booksUrl({
          [field]: text,
          limit: SEARCH_PAGE_SIZE,
          sort_order: "asc",
        }),
        options.signal,
      ),
    ),
  );

  const succeeded = responses.filter(
    (result): result is PromiseFulfilledResult<unknown> => result.status === "fulfilled",
  );
  if (succeeded.length === 0) {
    const first = responses.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    throw first?.reason ?? new OnlineSourceError("Could not reach the source.", "offline");
  }

  const seen = new Set<string>();
  const collections: OnlineCollection[] = [];
  for (const response of succeeded) {
    for (const raw of parseBooks(response.value)) {
      const collection = mapBook(raw, languageCode);
      if (!collection || seen.has(collection.key)) {
        continue;
      }
      seen.add(collection.key);
      collections.push(collection);
      if (collections.length >= SEARCH_ROWS) {
        return collections;
      }
    }
  }
  return collections;
}

async function getCollection(
  externalId: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineCollection | null> {
  const body = await requestJson<unknown>(
    booksUrl({ id: externalId, limit: 1 }),
    options.signal,
  );
  const books = parseBooks(body);
  for (const raw of books) {
    const collection = mapBook(raw);
    if (collection) {
      return collection;
    }
  }
  return null;
}

/** `librivox:1552` → `1552`. Throws when the key belongs to another source. */
function externalIdFromKey(collectionKey: string): string {
  const separator = collectionKey.indexOf(":");
  if (separator < 0 || collectionKey.slice(0, separator) !== LIBRIVOX_SOURCE.id) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  const externalId = collectionKey.slice(separator + 1);
  if (externalId.length === 0) {
    throw new OnlineSourceError("That collection is not from this source.", "not_found");
  }
  return externalId;
}

/** A chapter's position, from its own section number rather than its list slot. */
function sectionOrder(section: Section, index: number): number {
  const number = parseCount(section.section_number);
  return number > 0 ? number : Number.MAX_SAFE_INTEGER - (100_000 - index);
}

async function getTracks(
  collectionKey: string,
  options: { signal?: AbortSignal } = {},
): Promise<OnlineTrack[]> {
  const projectId = externalIdFromKey(collectionKey);
  const url = `${TRACKS_URL}?${new URLSearchParams({
    project_id: projectId,
    format: "json",
  }).toString()}`;

  const body = await requestJson<unknown>(url, options.signal);
  const parsed = sectionsResponseSchema.safeParse(body);
  if (!parsed.success || !Array.isArray(parsed.data.sections)) {
    throw new OnlineSourceError("That collection is no longer on the source.", "not_found");
  }

  const entries: { section: Section; index: number }[] = [];
  parsed.data.sections.forEach((raw, index) => {
    const section = sectionSchema.safeParse(raw);
    if (section.success) {
      entries.push({ section: section.data, index });
    }
  });

  entries.sort(
    (left, right) =>
      sectionOrder(left.section, left.index) - sectionOrder(right.section, right.index) ||
      left.index - right.index,
  );

  const tracks: OnlineTrack[] = [];
  for (const { section } of entries) {
    const externalId = idOf(section.id);
    const streamUrl = cleanedUrl(section.listen_url);
    if (!externalId || !streamUrl) {
      continue;
    }
    const order = tracks.length + 1;
    tracks.push({
      externalId,
      title: cleanText(section.title) ?? `Section ${order}`,
      artist: null,
      albumTitle: null,
      artworkUrl: null,
      streamUrl,
      // `playtime` is already whole seconds on this API; anything else becomes
      // "ask the player" rather than a wrong Integer bound for every statistic.
      durationSec: parseCount(section.playtime),
      order,
      pageUrl: null,
    });
  }

  return tracks;
}

export const librivoxAdapter: OnlineAdapter = {
  source: LIBRIVOX_SOURCE,
  listCollections,
  searchCollections,
  getCollection,
  getTracks,
};
