/**
 * The collection a queue belongs to, and what a run through it means.
 *
 * Everything here is pure. A run is described by three numbers — how many
 * tracks the collection had, how many of them were finished, and whether the
 * queue ran out — and every label, ratio and "is this a half-finished series?"
 * answer is derived from those rather than stored, so the History list, the
 * player's chip and the collection headers can never disagree.
 */

import type { ContextStats, ContextType, LocalContextPlay } from "@/lib/db/types";
import { folderKeyToRouteSegment } from "@/lib/mediaFolders";

/**
 * The collection currently being played. `key` is a local playlist id or a
 * folder key; `title` is captured when playback starts so the player can name
 * the collection without a query.
 */
export type PlaybackContext = {
  type: ContextType;
  key: string;
  title: string;
};

/** The run fields every label below reasons about. */
export type RunShape = Pick<
  LocalContextPlay,
  "completed" | "finishedCount" | "trackCount"
>;

/**
 * Two contexts are the same collection only if both halves match.
 *
 * Takes the two identifying halves rather than a whole `PlaybackContext`: the
 * callers that ask this question are comparing a live context against a stored
 * run row, and a run has no title of its own to compare.
 */
export function sameContext(
  a: Pick<PlaybackContext, "type" | "key"> | null,
  b: Pick<PlaybackContext, "type" | "key"> | null,
): boolean {
  if (!a || !b) {
    return a === b;
  }
  return a.type === b.type && a.key === b.key;
}

/** "Folder" / "Playlist", for an overline or a chip subtitle. */
export function describeContextType(type: ContextType): string {
  return type === "folder" ? "Folder" : "Playlist";
}

/**
 * Where tapping "view the playlist" should go.
 *
 * A discriminated union rather than one object with an optional pair of params:
 * the router's typed routes check each `pathname` against its own params, and a
 * merged type is not assignable to either branch.
 */
export type ContextRouteTarget =
  | { pathname: "/folder/[key]"; params: { key: string } }
  | { pathname: "/playlist/[id]"; params: { id: string } };

/**
 * Returned as data rather than pushed here, so the three places that offer the
 * control (mini-player, full player, history card) cannot end up routing to
 * different screens for the same collection.
 *
 * The folder key goes through `folderKeyToRouteSegment` for the same reason the
 * library screen uses it: the storage-root folder's key is the empty string, and
 * an empty path segment is not a route.
 */
export function contextRouteTarget(context: {
  type: ContextType;
  key: string;
}): ContextRouteTarget {
  return context.type === "folder"
    ? { pathname: "/folder/[key]", params: { key: folderKeyToRouteSegment(context.key) } }
    : { pathname: "/playlist/[id]", params: { id: context.key } };
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
 * least one track is still unfinished. This is the condition the listener
 * actually wants surfaced — "you are partway through this" — and it is
 * deliberately not the same as "interrupted", which a run that finished every
 * track and was then abandoned would also satisfy.
 */
export function isPartialRun(run: RunShape): boolean {
  if (run.completed || run.trackCount <= 0) {
    return false;
  }
  return run.finishedCount < run.trackCount;
}

/** "4 of 12" — where playback is inside the collection. */
export function formatContextPosition(index: number, trackCount: number): string {
  if (trackCount <= 0) {
    return "";
  }
  return `${Math.max(1, Math.min(index + 1, trackCount))} of ${trackCount}`;
}

/**
 * How a run reads in one line.
 *
 * "Stopped at 9 of 24" is the whole point of recording runs — it names the
 * partially completed series without the reader having to compare two numbers.
 * A run that heard every track but was left before the queue ran out is
 * reported as such rather than as an interruption, because from the listener's
 * side the collection *was* heard.
 */
export function describeRunOutcome(run: RunShape): { label: string; tone: "done" | "partial" } {
  if (run.completed) {
    return { label: "Finished", tone: "done" };
  }
  if (run.trackCount > 0 && run.finishedCount >= run.trackCount) {
    return { label: "All tracks heard", tone: "done" };
  }
  if (run.finishedCount > 0) {
    return {
      label: `Stopped at ${run.finishedCount} of ${run.trackCount}`,
      tone: "partial",
    };
  }
  return { label: "Left early", tone: "partial" };
}

/**
 * One line for a collection's header: how often it has been played through.
 *
 * A collection never played says nothing at all — the caller is joining this
 * into a line of other facts, and "Played 0 times" would be noise on every
 * folder in the library. One played many times leads with the completion count,
 * because "finished 3 of 5" is the fact that matters and "played 5 times" alone
 * would hide it.
 *
 * Comma rather than middot between the two clauses: this is itself joined with
 * middots, and a line reading "12h 30m · Played 3 times · finished 1" would look
 * like three unrelated facts.
 */
export function describeContextStats(stats: ContextStats): string | null {
  if (stats.playCount <= 0) {
    return null;
  }
  const plays = `${stats.playCount} time${stats.playCount === 1 ? "" : "s"}`;
  if (stats.completedPlayCount <= 0) {
    return `Played ${plays}`;
  }
  return `Played ${plays}, finished ${stats.completedPlayCount}`;
}

/**
 * "3 plays", for a card that already carries two other facts and has no room for
 * a sentence. Null when the collection has never been played, so the caller can
 * drop the clause rather than print a zero.
 */
export function formatPlayCount(playCount: number): string | null {
  if (playCount <= 0) {
    return null;
  }
  return `${playCount} play${playCount === 1 ? "" : "s"}`;
}

/** The second line under a run's title: what it covered, and how much of it. */
export function describeRunScope(run: RunShape): string {
  if (run.trackCount <= 0) {
    return "Empty collection";
  }
  const total = `${run.trackCount} track${run.trackCount === 1 ? "" : "s"}`;
  if (run.finishedCount >= run.trackCount) {
    return `All ${total} finished`;
  }
  return `${run.finishedCount} of ${total} finished`;
}

/**
 * Where resuming a run should drop the playhead, in whole seconds.
 *
 * A run whose last track was completed has nothing left on that track — seeking
 * to its end would complete it the instant it started — so a finished run
 * replays from the beginning of where it stopped. This is the run-level
 * counterpart of `resumeTargetSec` in `lib/history.ts`, and it applies the same
 * rule for the same reason.
 */
export function runResumeTargetSec(
  run: Pick<LocalContextPlay, "completed" | "lastPositionSec">,
): number {
  if (run.completed) {
    return 0;
  }
  return Math.max(0, Math.round(run.lastPositionSec));
}

/**
 * The run that should be offered as "continue this collection" — the newest one
 * that was left incomplete. `runs` must already be newest-first.
 *
 * Newest rather than longest: a collection played through last week and started
 * again today is a collection the listener is in the middle of *today*, and
 * resuming the older, more complete run would drop them somewhere they have
 * already moved past.
 */
export function latestPartialRun<T extends RunShape & { startedAt: number }>(
  runs: readonly T[],
): T | null {
  return runs.find((run) => isPartialRun(run)) ?? null;
}
