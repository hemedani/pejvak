/**
 * A small, short-lived cache in front of the source adapters.
 *
 * Browsing a language costs the archive one search, aminikhaah a catalogue
 * crawl, and LibriVox six pages of a 500-book feed. A listener who taps a
 * language, goes back, and taps it again should not pay for all of that twice,
 * and neither should the two screens that ask for the same shelf on one render.
 *
 * Three rules keep this from becoming a second source of truth:
 *
 *   · **Catalogue reads only.** Nothing the listener did — a favourite, a run,
 *     an annotation — is ever stored here; those belong to the backend.
 *   · **Every input is in the key.** The key is built by the caller from the
 *     whole request (source, language, query, collection id), so two different
 *     questions can never collide.
 *   · **Short and bounded.** Five minutes and fifty entries: long enough to
 *     cover a browse-and-back, short enough that a source's edits arrive, and
 *     bounded so a page full of languages cannot grow the process forever.
 *
 * It is process-local on purpose. The web client is not a CDN, and a shared
 * cache would need an eviction story this app does not have.
 */

import "server-only";

/** How long one answer is trusted. */
export const ONLINE_CACHE_TTL_MS = 5 * 60_000;

/** How many answers are kept before the oldest is dropped. */
export const ONLINE_CACHE_MAX_ENTRIES = 50;

type Entry = {
  storedAt: number;
  value: unknown;
};

const entries = new Map<string, Entry>();
const inFlight = new Map<string, Promise<unknown>>();

/**
 * A cache key from the parts of a request.
 *
 * JSON rather than string concatenation, so a query containing the separator
 * cannot make two different requests share a key. `undefined` is dropped so
 * "no language" and `languageCode: undefined` are the same request.
 */
export function cacheKey(parts: Record<string, string | number | boolean | null | undefined>): string {
  return JSON.stringify(
    Object.entries(parts)
      .filter(([, value]) => value !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

/**
 * The answer for `key`, loading it at most once per TTL.
 *
 * Concurrent misses share one request: two components asking for the same shelf
 * on one render is one crawl, not two. A failed load is not cached — the next
 * attempt gets a fresh chance, which is what makes retry after reconnecting
 * work without clearing anything by hand.
 *
 * `now` is injectable so the TTL can be tested without waiting five minutes.
 */
export async function cached<T>(
  key: string,
  load: () => Promise<T>,
  now: number = Date.now(),
): Promise<T> {
  const hit = entries.get(key);
  if (hit && now - hit.storedAt < ONLINE_CACHE_TTL_MS) {
    // Re-insert so the Map's insertion order is a use order; the eviction below
    // then drops the least recently used answer rather than the oldest one.
    entries.delete(key);
    entries.set(key, hit);
    return hit.value as T;
  }

  const pending = inFlight.get(key);
  if (pending) {
    return pending as Promise<T>;
  }

  const promise = load()
    .then((value) => {
      entries.set(key, { storedAt: now, value });
      trim();
      return value;
    })
    .finally(() => {
      inFlight.delete(key);
    });

  inFlight.set(key, promise);
  return promise as Promise<T>;
}

/** Drop the oldest answers until the cache is inside its bound. */
function trim(): void {
  while (entries.size > ONLINE_CACHE_MAX_ENTRIES) {
    const oldest = entries.keys().next();
    if (oldest.done) {
      return;
    }
    entries.delete(oldest.value);
  }
}

/** Test-only: forget everything, including requests still in flight. */
export function __resetOnlineCacheForTests(): void {
  entries.clear();
  inFlight.clear();
}
