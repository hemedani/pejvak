/**
 * `contentHash` for a streamed item.
 *
 * An online track's identity is the source's own id, never its URL. Sources
 * hand out signed, expiring URLs, so a hash taken from a URL would split one
 * episode into two rows and its history in half (root `AGENTS.md`). The address
 * that lasts is `sourceId:externalId`.
 */

const cache = new Map<string, Promise<string>>();

/** The identity string hashed for a streamed item. */
export function onlineIdentity(sourceId: string, externalId: string): string {
  return `online:${sourceId}:${externalId}`;
}

function toHex(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let out = "";
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, "0");
  }
  return out;
}

/**
 * `SHA-256("online:<sourceId>:<externalId>")`.
 *
 * Memoised per identity so a queue re-render does not re-hash, and so the same
 * item always reports the same hash even while its stream URL rotates.
 *
 * `crypto.subtle` exists only in a secure context; a plain-HTTP dev origin is
 * served as `localhost`, which browsers treat as secure. If it is genuinely
 * absent, this throws rather than inventing a weaker hash — a different hash is
 * a different track.
 */
export function onlineContentHash(sourceId: string, externalId: string): Promise<string> {
  const key = `${sourceId}\u0000${externalId}`;
  const existing = cache.get(key);
  if (existing) {
    return existing;
  }

  const promise = (async () => {
    if (typeof crypto === "undefined" || !crypto.subtle) {
      throw new Error("Web Crypto is unavailable; cannot identify an online track.");
    }
    const bytes = new TextEncoder().encode(onlineIdentity(sourceId, externalId));
    const digest = await crypto.subtle.digest("SHA-256", bytes);
    return toHex(digest);
  })();

  cache.set(key, promise);
  return promise;
}
