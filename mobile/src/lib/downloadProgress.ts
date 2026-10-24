/**
 * The rules that keep a download's progress from becoming the app's busiest
 * writer.
 *
 * The native downloader reports every chunk, which can be hundreds of callbacks
 * a second. Writing each one to SQLite and notifying every subscriber turns a
 * background transfer into a steady tax on the JS thread — and the numbers a row
 * draws only need to be right to the second, not to the byte. The threshold here
 * is deliberately coarse: half a second or a whole percentage point, whichever
 * comes first.
 *
 * `mergeJobs` solves the other half. A poll rebuilds every job row, so handing
 * those objects straight to memoised rows makes each row look new. Keeping the
 * previous object when every field still matches means one file's progress only
 * re-renders that file's row.
 */

import type { LocalDownloadJob } from "@/lib/db/types";

/** Write at most twice a second, even while bytes are arriving quickly. */
export const PROGRESS_WRITE_INTERVAL_MS = 500;

/** …but always write once the figure has visibly moved by a percentage point. */
export const PROGRESS_WRITE_DELTA_PERCENT = 1;

export type ProgressSample = {
  bytesWritten: number;
  totalBytes: number;
};

export type ProgressWrite = ProgressSample & { at: number };

/** A percentage clamped to 0–100, and 0 when the source never said how big it is. */
export function percentOf(bytesWritten: number, totalBytes: number): number {
  if (totalBytes <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (bytesWritten / totalBytes) * 100));
}

/** Whether this progress callback should reach the database. */
export function shouldWriteProgress(
  previous: ProgressWrite | undefined,
  next: ProgressSample,
  now: number,
): boolean {
  if (!previous) {
    return true;
  }
  if (next.totalBytes !== previous.totalBytes) {
    return true;
  }
  if (now - previous.at >= PROGRESS_WRITE_INTERVAL_MS) {
    return true;
  }
  return (
    percentOf(next.bytesWritten, next.totalBytes) -
      percentOf(previous.bytesWritten, previous.totalBytes) >=
    PROGRESS_WRITE_DELTA_PERCENT
  );
}

function sameJob(left: LocalDownloadJob, right: LocalDownloadJob): boolean {
  const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
  for (const key of keys) {
    if (
      (left as Record<string, unknown>)[key] !== (right as Record<string, unknown>)[key]
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Index a fresh read by track, reusing the previous object wherever the row is
 * unchanged.
 *
 * Returns the previous map itself when nothing moved, so a poll that finds the
 * same numbers does not invalidate every `jobsByTrack` prop.
 */
export function mergeJobs(
  previous: Record<string, LocalDownloadJob>,
  next: readonly LocalDownloadJob[],
): Record<string, LocalDownloadJob> {
  let changed = next.length !== Object.keys(previous).length;
  const merged: Record<string, LocalDownloadJob> = {};
  for (const job of next) {
    const before = previous[job.trackId];
    if (before && sameJob(before, job)) {
      merged[job.trackId] = before;
    } else {
      merged[job.trackId] = job;
      changed = true;
    }
  }
  return changed ? merged : previous;
}
