import { useCallback, useRef, useState } from "react";

import { backfillArtwork, countTracksMissingArtwork } from "@/services/ArtworkService";

export type UseArtworkBackfillResult = {
  /** Tracks that have not been examined for cover art yet. */
  remaining: number;
  /** True while a pass is running. */
  running: boolean;
  /** Re-reads the remaining count without doing any work. */
  refreshCount: () => Promise<void>;
  /** Runs one bounded pass. Resolves with how many covers were found. */
  run: (limit?: number) => Promise<number>;
};

/**
 * Fills in cover art for tracks imported before it was extracted.
 *
 * The work is bounded and idempotent: a pass examines a handful of files and
 * stamps each one it looked at, so a second pass moves on rather than starting
 * over. That is what lets the Library call `run` on every visit — the first few
 * visits do real work, and every visit after that is one cheap query returning
 * nothing.
 *
 * `running` is reported for the UI; the overlap guard is the ref below, because
 * state is a render behind and two calls in one tick would both read it as
 * false and then read the same unstamped rows twice.
 */
export function useArtworkBackfill(): UseArtworkBackfillResult {
  const [remaining, setRemaining] = useState(0);
  const [running, setRunning] = useState(false);
  /** Flips synchronously, which is the only thing a guard can rely on. */
  const inFlight = useRef(false);

  const refreshCount = useCallback(async () => {
    setRemaining(await countTracksMissingArtwork().catch(() => 0));
  }, []);

  const run = useCallback(
    async (limit = 20): Promise<number> => {
      if (inFlight.current) {
        return 0;
      }
      inFlight.current = true;
      let found = 0;
      setRunning(true);
      try {
        const outcome = await backfillArtwork({ limit });
        found = outcome.found;
      } catch {
        // Cover art is never worth surfacing as an error: the tiles fall back to
        // their gradient, which is the intended look for a track without any.
      } finally {
        inFlight.current = false;
        setRunning(false);
        await refreshCount();
      }
      return found;
    },
    [refreshCount],
  );

  return { remaining, running, refreshCount, run };
}
