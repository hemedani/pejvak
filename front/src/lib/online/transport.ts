/**
 * The one way an adapter talks to a source.
 *
 * Every source is a stranger's server, so the same four things have to be true
 * of every request: it must stop when the work that asked for it is abandoned,
 * it must fail in bounded time even when the server accepts the connection and
 * then says nothing, it must not be talked into fetching an arbitrary address,
 * and it must fail with a *typed* error so a caller can branch on the reason
 * instead of on a message.
 *
 * This lives apart from any one adapter because it is the only part of the work
 * that is identical for all of them: a second source should bring its own
 * mapping rules and nothing else.
 *
 * It is server-only. The source's address and its signed media URLs have no
 * business in a browser bundle, and neither does the provider's API key.
 */

import "server-only";

import { OnlineSourceError } from "@/lib/online/types";

/** Long enough for a slow catalogue page, short enough to not feel hung. */
export const DEFAULT_TIMEOUT_MS = 20_000;

/** A catalogue page is kilobytes; anything near this is a broken source. */
export const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

/**
 * The hosts an adapter is allowed to reach.
 *
 * This is the registry, written down: an adapter constructs its URL from a
 * constant, but a bug or a compromised response could still try to make this
 * function fetch something else. The check runs before the request, not after.
 *
 * The suffix entries are storage and mirror fleets: the archive serves media
 * from `ia*.us.archive.org`, and Radio Browser's discovered mirrors all live
 * under `radio-browser.info`. They are narrower than a wildcard because the
 * leading dot is part of the comparison.
 */
const ALLOWED_HOSTS: ReadonlySet<string> = new Set([
  "manahej.ir",
  "aminikhaah.ir",
  "dl.aminikhaah.ir",
  "archive.org",
  "librivox.org",
  "api.librivox.org",
  "de1.api.radio-browser.info",
]);

const ALLOWED_HOST_SUFFIXES: readonly string[] = [
  ".radio-browser.info",
  ".us.archive.org",
  ".archive.org",
];

export function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return (
    ALLOWED_HOSTS.has(host) ||
    ALLOWED_HOST_SUFFIXES.some((suffix) => host.endsWith(suffix))
  );
}

function assertAllowedUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new OnlineSourceError("The source address is malformed.", "invalid_response");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new OnlineSourceError("The source address is not web traffic.", "invalid_response");
  }
  if (!isAllowedHost(parsed.hostname)) {
    throw new OnlineSourceError("The source address is not on the allowlist.", "invalid_response");
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof Error && /abort/i.test(error.name + error.message);
}

/**
 * Read a body, refusing to buffer more than the cap.
 *
 * `Content-Length` is only a hint (a chunked response has none, and a lying one
 * has the wrong number), so the cap is enforced while reading as well. The
 * stream is cancelled as soon as it exceeds the limit rather than draining it.
 */
async function readCapped(response: Response): Promise<string> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > MAX_RESPONSE_BYTES) {
    throw new OnlineSourceError("The source sent too much data.", "invalid_response");
  }

  if (!response.body) {
    return "";
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      total += value.byteLength;
      if (total > MAX_RESPONSE_BYTES) {
        await reader.cancel().catch(() => undefined);
        throw new OnlineSourceError("The source sent too much data.", "invalid_response");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * Fetch one URL and hand the response to a reader, turning every failure into
 * an `OnlineSourceError`.
 *
 * The caller's `signal` and our own timeout are merged so abandoned work stops,
 * while a server that accepts the connection and then says nothing still fails
 * in bounded time. Distinguishing timeout from a cancel matters: only one of
 * them is worth retrying.
 *
 * Redirects are refused. An adapter builds every URL itself, so a redirect is
 * either the source moving (a change to adapt to) or an attempt to take the
 * server somewhere the allowlist did not cover — neither is something to follow
 * silently.
 */
async function request<T>(
  url: string,
  read: (response: Response) => Promise<T>,
  signal: AbortSignal | undefined,
  headers: Record<string, string> | undefined,
  accept: string,
): Promise<T> {
  assertAllowedUrl(url);

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, DEFAULT_TIMEOUT_MS);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: accept, ...headers },
      redirect: "error",
      cache: "no-store",
    });
    if (!response.ok) {
      throw new OnlineSourceError(
        response.status === 404
          ? "That collection is no longer on the source."
          : `The source answered with ${response.status}.`,
        response.status === 404 ? "not_found" : "invalid_response",
      );
    }
    return await read(response);
  } catch (error) {
    if (error instanceof OnlineSourceError) {
      throw error;
    }
    if (isAbortError(error)) {
      throw new OnlineSourceError(
        timedOut ? "The source took too long to answer." : "Request cancelled.",
        timedOut ? "timeout" : "offline",
      );
    }
    if (error instanceof SyntaxError) {
      throw new OnlineSourceError("The source sent something unreadable.", "invalid_response");
    }
    throw new OnlineSourceError("Could not reach the source.", "offline");
  } finally {
    clearTimeout(timer);
  }
}

/** Fetch and parse a JSON body. */
export async function requestJson<T>(
  url: string,
  signal?: AbortSignal,
  headers?: Record<string, string>,
): Promise<T> {
  const text = await request(url, readCapped, signal, headers, "application/json");
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new OnlineSourceError("The source sent something unreadable.", "invalid_response");
  }
}

/**
 * Fetch a server-rendered page.
 *
 * A source without a JSON API still has a catalogue; this is how its HTML is
 * read, with the same timeout, cancellation, allowlist and typed errors as
 * every other request.
 */
export function requestText(url: string, signal?: AbortSignal): Promise<string> {
  return request(url, readCapped, signal, undefined, "text/html");
}
