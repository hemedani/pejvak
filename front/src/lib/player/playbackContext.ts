/**
 * The collection a queue belongs to, and what a run through it means.
 *
 * Ported from `mobile/src/lib/playbackContext.ts`. The arithmetic and the
 * handover rules are unchanged; the labels are Persian because the web has no
 * locale switcher (D10). A run is described by three numbers — how many tracks
 * the collection had, how many were finished, and whether the queue ran out —
 * and every label is derived from those rather than stored.
 */

import { fa } from "@/lib/format";
import type { LocalRun, PlaybackContext, QueuedSession } from "./types";

export type RunShape = Pick<LocalRun, "completed" | "finishedCount" | "trackCount">;

/** Two contexts are the same collection only if both halves match. */
export function sameContext(
  a: Pick<PlaybackContext, "type" | "key"> | null,
  b: Pick<PlaybackContext, "type" | "key"> | null,
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.type === b.type && a.key === b.key;
}

/** `آنلاین` / `پلی‌لیست`, for an overline or a chip subtitle. */
export function describeContextType(type: PlaybackContext["type"]): string {
  return type === "online" ? "آنلاین" : "پلی‌لیست";
}

/** `۴ از ۱۲` — where playback is inside the collection. */
export function formatContextPosition(index: number, trackCount: number): string {
  if (trackCount <= 0) {
    return "";
  }
  return `${fa(Math.max(1, Math.min(index + 1, trackCount)))} از ${fa(trackCount)}`;
}

/** Finished share of a run, clamped to 0–1. A zero-length run reports 0. */
export function runProgressRatio(finishedCount: number, trackCount: number): number {
  if (trackCount <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, finishedCount / trackCount));
}

/**
 * A series left half-heard: the run started, the queue never ran out, and at
 * least one track is still unfinished.
 */
export function isPartialRun(run: RunShape): boolean {
  if (run.completed || run.trackCount <= 0) {
    return false;
  }
  return run.finishedCount < run.trackCount;
}

/**
 * How a run reads in one line.
 *
 * "متوقف در ۹ از ۲۴" names the partially completed series without making the
 * reader compare two numbers. A run that heard every track but was left before
 * the queue ran out is reported as such, because from the listener's side the
 * collection *was* heard.
 */
export function describeRunOutcome(run: RunShape): { label: string; tone: "done" | "partial" } {
  if (run.completed) {
    return { label: "تمام شد", tone: "done" };
  }
  if (run.trackCount > 0 && run.finishedCount >= run.trackCount) {
    return { label: "همهٔ قطعه‌ها شنیده شد", tone: "done" };
  }
  if (run.finishedCount > 0) {
    return {
      label: `متوقف در ${fa(run.finishedCount)} از ${fa(run.trackCount)}`,
      tone: "partial",
    };
  }
  return { label: "زودتر رها شد", tone: "partial" };
}

/** The second line under a run's title: what it covered, and how much of it. */
export function describeRunScope(run: RunShape): string {
  if (run.trackCount <= 0) {
    return "مجموعهٔ خالی";
  }
  if (run.finishedCount >= run.trackCount) {
    return `همهٔ ${fa(run.trackCount)} قطعه شنیده شد`;
  }
  return `${fa(run.finishedCount)} از ${fa(run.trackCount)} قطعه شنیده شد`;
}

/**
 * Where resuming a run should drop the playhead, in whole seconds.
 *
 * A run whose last track was completed has nothing left on that track — seeking
 * to its end would complete it the instant it started — so a finished run
 * replays from the beginning of where it stopped.
 */
export function runResumeTargetSec(
  run: Pick<LocalRun, "completed" | "lastPositionSec">,
): number {
  if (run.completed) {
    return 0;
  }
  return Math.max(0, Math.round(run.lastPositionSec));
}

/** The newest run that was left incomplete. `runs` must be newest-first. */
export function latestPartialRun<T extends RunShape & { startedAt: number }>(
  runs: readonly T[],
): T | null {
  return runs.find((run) => isPartialRun(run)) ?? null;
}

/**
 * Derivations from a run's own sessions.
 *
 * `finishedCount` counts distinct completed track hashes, not completed
 * sessions: replaying one track three times is not three finished lectures.
 */
export function runFiguresFromSessions(
  runClientId: string,
  sessions: readonly QueuedSession[],
): { listenedSec: number; finishedHashes: string[] } {
  let listenedSec = 0;
  const finished = new Set<string>();

  for (const session of sessions) {
    if (session.contextPlayId !== runClientId) {
      continue;
    }
    listenedSec += Math.max(0, Math.round(session.durationListenedSec));
    if (session.completed) {
      finished.add(session.contentHash);
    }
  }

  return { listenedSec, finishedHashes: [...finished] };
}
