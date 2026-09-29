/**
 * File and folder naming for downloaded audio.
 *
 * Everything here is pure, and it is all about one promise the app makes: a
 * downloaded course lands on the device as a folder a human would have made
 * themselves — `Online/Manahej/تاریخ شیعه/03 - نسخه پیروزی.mp3` — not as a pile
 * of signed URLs with query strings in the names.
 *
 * The rules exist because the source titles are hostile input: they are Persian
 * prose containing `/`, `؟`, quotes, colons, emoji and 120-character headlines.
 * Each of those is either illegal in a path or unpleasant in a list, so every
 * name passes through the same sanitiser.
 */

/** The folder every download lives under, inside app storage. */
export const ONLINE_ROOT = "Online";

/** Characters no filesystem we ship on will accept, plus the separator. */
const ILLEGAL = /[\\/:*?"<>|]/g;
/** Control characters, including the RTL/LTR marks Persian titles often carry. */
const CONTROL = /[\u0000-\u001F\u007F\u200E\u200F\u202A-\u202E]/g;

/** Long enough to keep a title readable, short enough to stay under any limit. */
const MAX_SEGMENT = 90;

/**
 * Make one path segment safe, without emptying it.
 *
 * Trailing dots and spaces are stripped because Windows-derived storage layers
 * reject them; an empty result falls back to the caller's placeholder rather
 * than producing a nameless file.
 */
export function sanitizeSegment(value: string, fallback = "Untitled"): string {
  const cleaned = value
    .replace(CONTROL, "")
    .replace(ILLEGAL, "-")
    // Collapse the whitespace the substitutions leave behind.
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[. ]+$/, "");

  if (cleaned.length === 0) {
    return fallback;
  }
  if (cleaned.length <= MAX_SEGMENT) {
    return cleaned;
  }
  // Cut on a word boundary when there is one near the limit, so a truncated
  // title does not end mid-word.
  const clipped = cleaned.slice(0, MAX_SEGMENT);
  const lastSpace = clipped.lastIndexOf(" ");
  return (lastSpace > MAX_SEGMENT * 0.6 ? clipped.slice(0, lastSpace) : clipped).trim();
}

/**
 * A stable, ASCII-only folder name for a collection.
 *
 * Persian titles slugify to nothing under an ASCII filter, so the slug is
 * derived from the *source's own id* when the title yields no usable
 * characters. That keeps the on-disk folder unique and sortable without
 * mangling the human-facing name, which is stored separately.
 */
export function slugify(value: string, fallback: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug.length > 0 ? slug : fallback;
}

/**
 * The database folder key for a downloaded collection.
 *
 * Deliberately not the on-disk path: the key is what groups tracks into one
 * collection in the UI, and it must be unique per collection and stable across
 * devices. The path can then be reorganised later without orphaning the rows.
 */
export function collectionFolderKey(sourceId: string, externalId: string): string {
  return `${ONLINE_ROOT}/${sourceId}/${externalId}`;
}

/**
 * The relative on-disk folder for a collection, under app storage.
 *
 * The source's own id is part of the folder name, and that is not decoration:
 * two shows on one source can legitimately carry the same title, and without
 * the id they would write `01 - …` over each other in one directory. It is also
 * the only part of the name that survives the show being renamed upstream, so a
 * downloaded course can always be traced back to what it came from.
 */
export function collectionRelativePath(
  sourceId: string,
  collectionTitle: string,
  externalId: string,
): string {
  const title = sanitizeSegment(collectionTitle, slugify(collectionTitle, externalId));
  return [
    ONLINE_ROOT,
    sanitizeSegment(sourceId, "source"),
    `${title} (${sanitizeSegment(externalId, "collection")})`,
  ].join("/");
}

/** The file extension to save a stream under, taken from its URL path. */
export function extensionFromUrl(url: string, fallback = "mp3"): string {
  const path = url.split("?")[0]?.split("#")[0] ?? "";
  const match = /\.([a-z0-9]{2,5})$/i.exec(path);
  if (!match) {
    return fallback;
  }
  const extension = match[1].toLowerCase();
  // Only audio containers we are confident about; anything else is a signed
  // URL whose tail is not a file name at all.
  return ["mp3", "m4a", "mp4", "aac", "ogg", "opus", "wav", "flac"].includes(extension)
    ? extension
    : fallback;
}

/**
 * The file name for one track: zero-padded position, then the title.
 *
 * The padding is what makes the folder sort correctly in any file manager, and
 * the position comes from the collection's own order — so a downloaded course
 * reads 01, 02, 03 … in the order it is meant to be heard.
 */
export function trackFileName(order: number, title: string, streamUrl: string): string {
  const position = Math.max(1, Math.round(order));
  const padded = String(position).padStart(2, "0");
  return `${padded} - ${sanitizeSegment(title, `Track ${padded}`)}.${extensionFromUrl(streamUrl)}`;
}
