"use client";

/**
 * The line between the browser and a source's bytes.
 *
 * The player resolves a stream by asking the registry for a resolver keyed by
 * source id (`lib/player/stream.ts`); nothing registers one until something in
 * the browser does. This is that something, and it exists as a component so it
 * can live in the shell and be mounted exactly once.
 *
 * What crosses the boundary is `{ id, live }` — two serialisable fields. The
 * source descriptors themselves are server data (`SOURCES` carries homepages and
 * attribution strings), and a client component has no business importing the
 * module that could also reach an adapter.
 *
 * The failure mapping is the whole of the player's error vocabulary here:
 *
 *   · a track the source no longer has is `not-found` — retrying cannot help;
 *   · everything else (offline, timeout, a source that changed shape) is
 *     `source-unavailable`, which the player treats as retryable.
 *
 * The registry is process-global in the browser on purpose. It is not React
 * state: a resolver must survive a remount of this component, and a queue built
 * on one page must still resolve on the next.
 */

import { useEffect } from "react";

import { resolveOnlineStream } from "@/app/actions/online/resolve-online-stream";
import { problemCodeFor } from "@/lib/online/problems";
import { StreamError, registerLiveSource, registerStreamResolver } from "@/lib/player/stream";

export function OnlineStreamBridge({
  sources,
}: {
  sources: readonly { id: string; live: boolean }[];
}) {
  // The identity of the list, not the array: the server rebuilds the array on
  // every navigation, and re-registering an unchanged set of sources on each one
  // would be work with no effect.
  const signature = sources.map((source) => `${source.id}:${source.live ? 1 : 0}`).join(",");

  useEffect(() => {
    for (const source of sources) {
      if (source.live) {
        registerLiveSource(source.id);
      }

      registerStreamResolver(source.id, async (input) => {
        const result = await resolveOnlineStream(input);
        if (!result.success) {
          const code = problemCodeFor(result.error);
          throw new StreamError(
            code === "not_found" ? "not-found" : "source-unavailable",
            result.error.message,
          );
        }
        return result.body;
      });
    }
    // `signature` is `sources`' identity; the array itself is new on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return null;
}
