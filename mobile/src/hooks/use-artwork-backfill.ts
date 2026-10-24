import { useCallback, useRef, useState } from "react";

import {
  backfillArtwork,
  countTracksMissingArtwork,
  type BackfillOutcome,
} from "@/services/ArtworkService";

export type UseArtworkBackfillResult = {
  /** Tracks that have not been examined for cover art yet. */
  remaining: number;
  /** True while a pass is running. */
  running: boolean;
  /** Re-reads the remaining count without doing any work. */
  refreshCount: () => Promise<void>;
  /**
   * Runs one bounded pass. Resolves with what it found, including the rows that
   * gained a cover — so the caller can merge those into a list it already drew.
   */
  run: (limit?: number, isCancelled?: () => boolean) => Promise<BackfillOutcome>;
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
    async (limit = 20, isCancelled?: () => boolean): Promise<BackfillOutcome> => {
      if (inFlight.current) {
        return { scanned: 0, found: 0, empty: 0, failed: 0, skipped: 0, changed: [] };
      }
      inFlight.current = true;
      let outcome: BackfillOutcome = {
        scanned: 0,
        found: 0,
        empty: 0,
        failed: 0,
        skipped: 0,
        changed: [],
      };
      setRunning(true);
      try {
        outcome = await backfillArtwork({ limit, isCancelled });
      } catch {
        // Cover art is never worth surfacing as an error: the tiles fall back to
        // their gradient, which is the intended look for a track without any.
      } finally {
        inFlight.current = false;
        setRunning(false);
        await refreshCount();
      }
      return outcome;
    },
    [refreshCount],
  );

  return { remaining, running, refreshCount, run };
}
