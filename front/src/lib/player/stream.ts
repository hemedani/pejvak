/**
 * A playable address for a streamed track.
 *
 * This is the seam Phase 4.1 fills. `front/` does not have the online adapters
 * yet, so the player consumes this two-function interface and nothing more:
 *
 *   - `registerStreamResolver(sourceId, fn)` is called once per source when the
 *     adapters arrive;
 *   - `resolveStreamUrl` asks the registry for a *fresh* address immediately
 *     before load, never at queue-creation time.
 *
 * A missing resolver is not a retryable network error. It is a source that has
 * not been wired yet, and the player says so rather than looping.
 */

export type StreamResolution = {
  streamUrl: string;
  /** Measured or source-reported duration; 0 means "ask the audio element". */
  durationSec: number;
};

export type StreamResolver = (input: {
  sourceId: string;
  externalId: string;
  collectionKey: string;
}) => Promise<StreamResolution>;

export type StreamErrorCode = "no-resolver" | "source-unavailable" | "not-found" | "invalid-url";

export class StreamError extends Error {
  constructor(
    public readonly code: StreamErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "StreamError";
  }
}

const resolvers = new Map<string, StreamResolver>();
const liveSources = new Set<string>();

/** Called by the Phase 4 adapters, one line per source. */
export function registerStreamResolver(sourceId: string, resolver: StreamResolver): void {
  resolvers.set(sourceId, resolver);
}

/** A source with no duration, no seek, and no resume (radiobrowser, for one). */
export function registerLiveSource(sourceId: string): void {
  liveSources.add(sourceId);
}

export function isLiveSource(sourceId: string | null): boolean {
  return sourceId !== null && liveSources.has(sourceId);
}

export function hasStreamResolver(sourceId: string): boolean {
  return resolvers.has(sourceId);
}

/** Only `http:`/`https:` are addresses a browser can stream. */
export function isPlayableUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Resolve through the source adapter, then reject anything that is not a real
 * stream. Never build a source URL by string concatenation here: only the
 * adapter knows how its source names a file.
 */
export async function resolveStreamUrl(input: {
  sourceId: string;
  externalId: string;
  collectionKey: string;
}): Promise<StreamResolution> {
  const resolver = resolvers.get(input.sourceId);
  if (!resolver) {
    throw new StreamError(
      "no-resolver",
      `No stream resolver registered for source "${input.sourceId}".`,
    );
  }

  let result: StreamResolution;
  try {
    result = await resolver(input);
  } catch (error) {
    if (error instanceof StreamError) {
      throw error;
    }
    throw new StreamError(
      "source-unavailable",
      error instanceof Error ? error.message : "The source did not answer.",
    );
  }

  if (!isPlayableUrl(result.streamUrl)) {
    throw new StreamError("invalid-url", "The source did not return a playable address.");
  }

  return {
    streamUrl: result.streamUrl,
    durationSec:
      Number.isFinite(result.durationSec) && result.durationSec > 0
        ? Math.round(result.durationSec)
        : 0,
  };
}

/** Test-only: the registry is process-global by design. */
export function clearStreamRegistryForTests(): void {
  resolvers.clear();
  liveSources.clear();
}
