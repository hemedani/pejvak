/**
 * Assembling the one line under a title.
 *
 * A card's meta line is written by a dozen screens, and every one of them
 * re-invents the same three rules: drop the parts that are absent, never leave
 * a separator at either end, and never write a count as "1 tracks". The bugs
 * are always the same and always invisible until a listener sees "Playing · "
 * on a row with nothing else to say.
 *
 * Domain wording stays with the `describe*` helpers. This module only joins.
 */

const SEPARATOR = " · ";

/**
 * Joins the parts that exist with the app's separator, or null.
 *
 * A part that already ends in the separator is trimmed first: a caller that
 * forgot one of these rules should produce a clean line, not a doubled dot.
 */
export function joinMeta(
  parts: readonly (string | null | undefined)[],
): string | null {
  const cleaned: string[] = [];
  for (const part of parts) {
    if (!part) {
      continue;
    }
    let text = part.trim();
    while (text.endsWith("·")) {
      text = text.slice(0, -1).trimEnd();
    }
    if (text) {
      cleaned.push(text);
    }
  }
  return cleaned.length > 0 ? cleaned.join(SEPARATOR) : null;
}

/**
 * "1 track", "0 tracks", "2 entries".
 *
 * The count is part of the phrase because a caller that formats the number
 * separately will eventually format the noun separately too.
 */
export function plural(
  count: number,
  singular: string,
  irregularPlural?: string,
): string {
  const noun = count === 1 ? singular : (irregularPlural ?? `${singular}s`);
  return `${count} ${noun}`;
}
