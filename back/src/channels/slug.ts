/**
 * Slug derivation for `channel.slug` (plan §3a).
 *
 * The slug is the shareable, rename-stable public address (`/c/<slug>`). It is
 * derived from `name`, never sent by the client, and never edited on rename —
 * so the act that creates a channel owns this, and `updateChannel` leaves it
 * alone.
 *
 * The base is a lowercase, URL-safe transliteration. Because two creators (or
 * one creator twice) can pick the same name, uniqueness is resolved by the act
 * appending `-2`, `-3`, … until the candidate is free; `uniqueSlug` drives that
 * loop against any `exists` probe the caller supplies, so this file stays free
 * of a database import and is trivially testable.
 */

/** A URL-safe base slug from a display name (not yet guaranteed unique). */
export const baseSlug = (name: string): string => {
  const slug = name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "") // fold accents to their base letters
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");

  // A name of only punctuation or non-ASCII that survived nothing still needs a
  // non-empty slug; the unique index forbids an empty one.
  return slug.length > 0 ? slug : "channel";
};

/**
 * The first free slug derived from `name`.
 *
 * `exists` is asked about each candidate (`name`, `name-2`, `name-3`, …) and
 * returns whether it is taken. The caller closes over the database check, so the
 * collision domain — the whole `channel` collection — is exactly where the act
 * can see it.
 */
export const uniqueSlug = async (
  name: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> => {
  const base = baseSlug(name);

  if (!(await exists(base))) return base;

  for (let n = 2; n < 1000; n++) {
    const candidate = `${base}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }

  // Astronomically unlikely; a timestamp suffix keeps the unique index honest
  // rather than throwing a confusing collision deep in an insert.
  return `${base}-${Date.now()}`;
};
