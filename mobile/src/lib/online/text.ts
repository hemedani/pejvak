/**
 * Turning a source's fields into the strings the app shows.
 *
 * Sources are inconsistent in ways that are not worth a special case each. The
 * Internet Archive returns a field as a bare string when an item has one value
 * and as an array when it has several — the same field, in the same response.
 * manahej.ir returns titles with HTML entities already decoded and titles with
 * them still escaped, sometimes in the same playlist.
 *
 * The rule both share: a value the app cannot render becomes `null` rather than
 * an empty string, so a caller can tell "the source did not say" from "the
 * source said nothing", and no screen has to guard against `""` in a heading.
 */

/** The handful of entities these sources actually emit inside JSON strings. */
export function decodeEntities(value: string): string {
  return value
    .replace(/&#0?39;|&apos;|&#8217;/g, "'")
    .replace(/&#0?34;|&quot;|&#8220;|&#8221;/g, '"')
    .replace(/&#0?38;|&amp;/g, "&")
    .replace(/&#8211;/g, "–")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ");
}

/**
 * A field that may be a string or a list of strings, as the source's first
 * usable value.
 *
 * The Internet Archive does this to `creator`, `title` and `language`: an item
 * credited to one person sends a string, an item credited to three sends an
 * array. Reading only the string case would silently drop the author from every
 * collaborative recording.
 */
export function asString(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry === "string" && entry.trim().length > 0) {
        return entry;
      }
    }
  }
  return null;
}

/** A trimmed, entity-decoded string, or null when there is nothing to show. */
export function cleanText(value: unknown): string | null {
  const raw = asString(value);
  if (raw === null) {
    return null;
  }
  const decoded = decodeEntities(raw).trim();
  return decoded.length > 0 ? decoded : null;
}
