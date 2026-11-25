import { channelAudio } from "../../mod.ts";
import {
  listStoredFiles,
  removeStoredBytes,
  selectReclaimablePaths,
} from "./media.ts";

/**
 * Deferred upload hygiene (prompt D18, item 2).
 *
 * Atomic writes stop an aborted upload from leaving a `.part`, but two holes
 * remain outside the request: a crash between writing the completed file and
 * publishing its row, and a `.part` left by a process kill that never reached
 * its `catch`. Nothing in the request path can reclaim those — the file is not
 * referenced by a row, so no delete act will ever name it. This sweep is the
 * inverse of `removeStoredBytes`: it finds the bytes no row points at.
 *
 * It is deliberately **not** wired into a request. Running it inline would scan
 * the whole tree on every upload and could race a live one; the plan keeps it
 * deferred (D13/D14). `sweepOrphanUploads` is the callable unit a future cron
 * uses, and `deno task sweep:uploads` is the operator's manual trigger today.
 */

/** A day is long enough that no live upload or un-published file is touched. */
export const DEFAULT_STALE_AFTER_MS = 24 * 60 * 60 * 1000;

export type SweepReport = {
  /** Stale `.part` leaves reclaimed. */
  parts: number;
  /** Completed files with no `channelAudio` row reclaimed. */
  orphans: number;
  /** Files actually unlinked (some may already be gone). */
  removed: number;
};

/** Every `mediaPath` a `channelAudio` row still points at. */
const referencedMediaPaths = async (): Promise<Set<string>> => {
  const rows = await channelAudio
    .aggregation({
      pipeline: [
        { $match: { mediaPath: { $exists: true, $ne: null } } },
        { $group: { _id: "$mediaPath" } },
      ],
    })
    .toArray();

  const referenced = new Set<string>();
  for (const row of rows) {
    const mediaPath = row._id;
    if (typeof mediaPath === "string" && mediaPath.length > 0) {
      referenced.add(mediaPath);
    }
  }
  return referenced;
};

/**
 * Reclaims stale `.part` leaves and completed files nothing references.
 *
 * `staleAfterMs` defaults to a day; both the age rail and the referenced-set
 * comparison are the safety rules described in `selectReclaimablePaths`. The
 * report distinguishes "was reclaimable" from "actually unlinked" so a missing
 * file (already swept, or never on this host) is not mistaken for a failure.
 */
export const sweepOrphanUploads = async (
  options: { staleAfterMs?: number; nowMs?: number } = {},
): Promise<SweepReport> => {
  const staleAfterMs = options.staleAfterMs ?? DEFAULT_STALE_AFTER_MS;
  const nowMs = options.nowMs ?? Date.now();

  const [files, referenced] = await Promise.all([
    listStoredFiles(),
    referencedMediaPaths(),
  ]);
  const { parts, orphans } = selectReclaimablePaths(
    files,
    referenced,
    nowMs,
    staleAfterMs,
  );

  const removed = await removeStoredBytes([...parts, ...orphans]);
  return { parts: parts.length, orphans: orphans.length, removed };
};

if (import.meta.main) {
  try {
    const report = await sweepOrphanUploads();
    console.log(
      `Reclaimed ${report.removed} file(s): ${report.parts} stale part(s), ${report.orphans} orphan(s).`,
    );
    Deno.exit(0);
  } catch (error) {
    console.error("Upload sweep failed:", error);
    Deno.exit(1);
  }
}
