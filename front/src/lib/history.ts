/**
 * The listening stretch — one continuous listen, spanning as many tracks as the
 * player got through without the listener deliberately changing track.
 *
 * Ported from `mobile/src/lib/listeningStretch.ts`, with the local-database row
 * replaced by the server's `HistorySession`. The rules are unchanged, and the
 * reason they exist is unchanged: the stored row is still *one track* — that is
 * what a track's play count is built from — so a stretch is those rows read
 * together. Nothing here is stored, and there is no second copy of a figure to
 * keep in step.
 *
 * What separates the two is intent:
 *   - scrubbing inside a track changes nothing, so it does not cut a stretch;
 *   - automatic progression is not the listener's doing, so it does not either;
 *   - moving to another track by hand does, and starts a new one.
 *
 * ## One verdict per stretch
 *
 * `completed` and `interrupted` are written by the phone. This module *reports*
 * them and never recomputes "did they finish" from positions: a scrub leaves a
 * perfectly plausible position behind, which is why `seeked` is stored rather
 * than derived. The one thing it does compute is `isComplete`, and it says so
 * out loud (see below).
 */

import type { HistorySession } from "@/lib/domain/history";
import { formatCount, formatSpan } from "@/lib/format";
import { formatClock, formatDayHeading, formatTimeOfDay, formatYear, startOfDay } from "@/lib/time";

export type ListeningStretch = {
  id: string;
  startedAt: number;
  endedAt: number | null;
  /** The track the listener started on, and the second within it. */
  startTrackId: string | null;
  startContentHash: string;
  startPositionSec: number;
  /** The track they stopped on, and the second within it. */
  endTrackId: string | null;
  endContentHash: string;
  endPositionSec: number | null;
  /** How many tracks were heard without a break. */
  trackCount: number;
  listenedSec: number;
  playbackSpeed: number;
  /** Whether anything was scrubbed anywhere in the stretch. */
  seeked: boolean;
  /** The last track was played through to its end. */
  completed: boolean;
  interrupted: boolean;
  contextPlayId: string | null;
  contextType: string | null;
  contextKey: string | null;
  /** Every member, in the order it was heard. */
  members: HistorySession[];
  /**
   * Heard from the very first second of the first track through to the end of
   * the last, with nothing skipped.
   *
   * Distinct from `completed`, which only says the last track ran out: a
   * listener who opened a book at chapter three and stopped when it ended has a
   * finished session and has not heard the book.
   */
  isComplete: boolean;
};

/** How a stretch ended, from the listener's point of view. */
export type StretchOutcome = "complete" | "finished" | "interrupted" | "open";

/**
 * Orders members by when they started.
 *
 * The input arrives ordered already, but a stretch is assembled from rows read
 * back over days — including, after a sync, from a device that never saw them —
 * so the first and last track must not depend on the query's ordering.
 */
function inListeningOrder(members: readonly HistorySession[]): HistorySession[] {
  return [...members].sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Reads one stretch off its member sessions.
 *
 * Returns null for an empty group rather than inventing a stretch with no
 * tracks: a caller that has no members has no stretch.
 */
export function buildStretch(members: readonly HistorySession[]): ListeningStretch | null {
  const ordered = inListeningOrder(members);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];
  if (!first || !last) {
    return null;
  }

  const seeked = ordered.some((member) => member.seeked);
  const completed = last.completed;
  const endedAt = last.endedAt;

  return {
    id: first.stretchId,
    startedAt: first.startedAt,
    endedAt,
    startTrackId: first.track?.id ?? null,
    startContentHash: first.track?.contentHash ?? first.contentHash,
    startPositionSec: first.startPositionSec,
    endTrackId: last.track?.id ?? null,
    endContentHash: last.track?.contentHash ?? last.contentHash,
    endPositionSec: last.endedAt === null ? null : last.endPositionSec,
    trackCount: ordered.length,
    // The sum of what was actually played, not the distance between two
    // positions: a seek moves the position without adding listening time.
    listenedSec: ordered.reduce((total, member) => total + member.durationListenedSec, 0),
    playbackSpeed: first.playbackSpeed,
    seeked,
    completed,
    interrupted: ordered.some((member) => member.interrupted),
    contextPlayId: first.contextPlayId,
    contextType: first.contextType,
    contextKey: first.contextKey,
    members: ordered,
    // All three, or it was not heard through: it has to start at the beginning
    // of its first track, reach the end of its last, and have no gap in between.
    isComplete: endedAt !== null && completed && !seeked && first.startPositionSec === 0,
  };
}

/**
 * Groups sessions into stretches, newest stretch first.
 *
 * A row with no group of its own is a stretch of one — which is what the v10
 * backfill made of every row written before stretches existed, and what
 * `parseHistorySession` produces when the column is missing.
 */
export function groupSessionsIntoStretches(
  sessions: readonly HistorySession[],
): ListeningStretch[] {
  const groups = new Map<string, HistorySession[]>();
  for (const session of sessions) {
    const group = groups.get(session.stretchId);
    if (group) {
      group.push(session);
    } else {
      groups.set(session.stretchId, [session]);
    }
  }

  return [...groups.values()]
    .map((members) => buildStretch(members))
    .filter((stretch): stretch is ListeningStretch => stretch !== null)
    .sort((a, b) => b.startedAt - a.startedAt);
}

export function describeStretchOutcome(stretch: ListeningStretch): StretchOutcome {
  if (stretch.isComplete) {
    return "complete";
  }
  if (stretch.endedAt === null) {
    return "open";
  }
  return stretch.completed ? "finished" : "interrupted";
}

/**
 * The verdict as one badge, or `null` while the listen is still open.
 *
 * Two words for two facts, and the difference is worth keeping: `complete` means
 * the whole stretch was heard, from the first second of the first track to the
 * end of the last; `finished` means only that the last track ran out, which is
 * also what happens to a listener who opened a book at chapter three. Collapsing
 * them into one word would let a partial listen claim a complete one.
 */
export function describeStretchVerdict(
  stretch: ListeningStretch,
): { label: string; tone: "accent" | "neutral" | "danger" } | null {
  switch (describeStretchOutcome(stretch)) {
    case "complete":
      return { label: "Complete", tone: "accent" };
    case "finished":
      return { label: "Finished", tone: "neutral" };
    case "interrupted":
      return { label: "Interrupted", tone: "danger" };
    default:
      return null;
  }
}

/**
 * Which track tapping a stretch should reopen, and where inside it.
 *
 * Two answers, not one, because the second belongs to a different track: a
 * stretch heard through replays from the track it began on, and anything else
 * continues from the track it stopped on. Returning a bare number would let a
 * caller pair the start track with the end track's position, which lands the
 * listener minutes into a file they never reached.
 *
 * A stretch that ran to the end of its last track has nothing left to resume —
 * seeking to its end would finish that track the instant it started — so it
 * replays from the point it began.
 */
export function stretchResumeTarget(stretch: ListeningStretch): {
  trackId: string | null;
  contentHash: string;
  positionSec: number;
} {
  if (stretch.completed) {
    return {
      trackId: stretch.startTrackId,
      contentHash: stretch.startContentHash,
      positionSec: Math.max(0, Math.round(stretch.startPositionSec)),
    };
  }
  return {
    trackId: stretch.endTrackId,
    contentHash: stretch.endContentHash,
    positionSec: Math.max(
      0,
      Math.round(stretch.endPositionSec ?? stretch.startPositionSec),
    ),
  };
}

/**
 * The two ends of a stretch, each with the id of the track it names.
 *
 * Split from `describeStretchTitle` because the row links each end to its own
 * track page, and a single string cannot say which half is clickable. The string
 * form is derived from this one, so the two cannot disagree about the order or
 * about the fallback.
 */
export type StretchTitle = {
  start: { title: string; trackId: string | null };
  /** The track it ended on, or `null` for a single-track listen. */
  end: { title: string; trackId: string | null } | null;
};

export function stretchTitleParts(stretch: ListeningStretch): StretchTitle {
  const first = stretch.members[0] ?? null;
  const last = stretch.members[stretch.members.length - 1] ?? null;

  const start = {
    title: first?.track?.title ?? "Deleted track",
    trackId: first?.track?.id ?? null,
  };

  if (stretch.trackCount <= 1) {
    return { start, end: null };
  }

  return {
    start,
    end: {
      title: last?.track?.title ?? "Deleted track",
      trackId: last?.track?.id ?? null,
    },
  };
}

/** The title a stretch is listed under: `start`, or `start → end`. */
export function describeStretchTitle(stretch: ListeningStretch): string {
  const parts = stretchTitleParts(stretch);
  return parts.end === null ? parts.start.title : `${parts.start.title} → ${parts.end.title}`;
}

/** `09:15 – 09:22` — the clock range a stretch covers. */
export function formatStretchTimeRange(stretch: ListeningStretch): string {
  if (stretch.endedAt === null) {
    return `${formatTimeOfDay(stretch.startedAt)} – in progress`;
  }
  return `${formatTimeOfDay(stretch.startedAt)} – ${formatTimeOfDay(stretch.endedAt)}`;
}

/**
 * The position range inside the tracks, only when the listen actually moved.
 *
 * A session that recorded `0 → 0` — a row synced before the phone tracked
 * positions — would otherwise read `0:00 – 0:00` beside every entry.
 */
export function formatStretchPositionRange(stretch: ListeningStretch): string | null {
  const end = stretch.endPositionSec;
  if (end === null || end <= stretch.startPositionSec) {
    return null;
  }
  return `${formatClock(stretch.startPositionSec)} – ${formatClock(end)}`;
}

/**
 * `3 tracks`, or `null` for a single-track listen.
 *
 * The count is omitted for one track because the title already says it, and
 * `1 track` beside one title is noise. A row that prints nothing is more accurate
 * than a row that prints a tautology.
 */
export function describeStretchTracks(stretch: ListeningStretch): string | null {
  return stretch.trackCount > 1 ? `${stretch.trackCount} tracks` : null;
}

/** A section of the list: one calendar day, or a flat list. */
export type HistorySection = {
  key: string;
  /** Day label ("Today", "October 14"), or null for a flat list. */
  title: string | null;
  data: ListeningStretch[];
  /** Total listened time in the group; enables a day header figure. */
  listenedSec: number;
};

/**
 * Groups stretches into the days they began on, newest day first.
 *
 * Bucketed by `startOfDay(startedAt)` — a number, never a formatted string: two
 * different days can format the same way, and the chart-style grouping that
 * compares strings silently merges them. A listen that ran past midnight belongs
 * to the evening it began, which is where the listener looks for it.
 *
 * Within a day the act's newest-first order is kept: a second sort would be a
 * second opinion about "recent".
 *
 * The year is printed only when the day is not in the current year. A history
 * from three years ago must not show two "October 14" headings with no way to tell
 * them apart.
 */
export function buildHistorySections(
  stretches: readonly ListeningStretch[],
  now: number,
): HistorySection[] {
  const buckets = new Map<number, ListeningStretch[]>();
  for (const stretch of stretches) {
    const key = startOfDay(stretch.startedAt);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(stretch);
    } else {
      buckets.set(key, [stretch]);
    }
  }

  const today = startOfDay(now);
  const yesterday = startOfDay(today - 86_400_000);
  const currentYear = new Date(now).getFullYear();

  return [...buckets.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([key, data]) => {
      const sameYear = new Date(key).getFullYear() === currentYear;
      const title =
        key === today
          ? "Today"
          : key === yesterday
            ? "Yesterday"
            : sameYear
              ? formatDayHeading(key)
              : `${formatDayHeading(key)} ${formatYear(key)}`;

      return {
        key: String(key),
        title,
        data,
        listenedSec: data.reduce((total, stretch) => total + stretch.listenedSec, 0),
      };
    });
}

/** The count and the total of one page — never a lifetime figure. */
export function describeHistorySummary(stretches: readonly ListeningStretch[]): string {
  const listenedSec = stretches.reduce((total, stretch) => total + stretch.listenedSec, 0);
  return `${formatCount(stretches.length, "session")} on this page · ${formatSpan(listenedSec)}`;
}

/**
 * A date range from the URL, as the act wants it.
 *
 * `from`/`to` arrive as `YYYY-MM-DD` and are parsed at local midnight, because
 * that is the day the listener means. `to` is inclusive, so it covers the whole
 * day: an end date of "October 30" that stopped at midnight would hide everything
 * heard on the 30th.
 *
 * An invalid or reversed range is not an error state. It is ignored, with a
 * caption, and the unfiltered history is shown — a hand-typed URL must not be
 * able to make the page refuse to render.
 */
export type HistoryRange = {
  /** Inclusive lower bound, or undefined for "no start". */
  from: number | undefined;
  /** Inclusive upper bound (the last millisecond of the day), or undefined. */
  to: number | undefined;
  /** True when both ends were present but the range made no sense. */
  invalid: boolean;
};

const DAY_MS = 86_400_000;

function parseDay(value: string | undefined): number | null {
  if (!value) {
    return null;
  }
  const parsed = Date.parse(`${value}T00:00:00`);
  return Number.isNaN(parsed) ? null : parsed;
}

export function parseHistoryRange(
  from: string | undefined,
  to: string | undefined,
): HistoryRange {
  const start = parseDay(from);
  const end = parseDay(to);

  if (start === null && end === null) {
    return { from: undefined, to: undefined, invalid: false };
  }
  if (start !== null && end !== null && start > end) {
    return { from: undefined, to: undefined, invalid: true };
  }

  return {
    from: start ?? undefined,
    to: end === null ? undefined : end + DAY_MS - 1,
    invalid: false,
  };
}

/**
 * The inverse of `parseDay`: the calendar day a timestamp falls in, as the
 * `YYYY-MM-DD` a date input and the URL both speak.
 *
 * Built from local `getFullYear`/`getMonth`/`getDate`, not from
 * `toISOString()`, which converts to UTC first: a range chosen in Tehran would
 * come back a day earlier for anything heard before 03:30 local. It is the same
 * reason `parseDay` appends `T00:00:00` instead of parsing bare `YYYY-MM-DD`
 * (which `Date.parse` reads as UTC).
 *
 * `range.to` is the last millisecond of its day, so this maps it back to the day
 * the listener picked rather than to the next one.
 */
export function isoDay(timestamp: number): string {
  const date = new Date(timestamp);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * A `/history` URL from the state the page is in.
 *
 * One builder for both controls, so the "Older" link and the retry link
 * cannot disagree about which range is active:
 *
 *   · a cursor of 0 is the first page, so it is omitted — `/history?after=0`
 *     and `/history` must not be two URLs for one screen;
 *   · the range is carried by every link that does not change it, which is what
 *     keeps a filter applied across pagination;
 *   · a link that *does* change the range simply omits `after`, because page
 *     four of a different range does not exist. The caller drops it by not
 *     passing it, rather than this function guessing when to reset.
 */
export function buildHistoryHref(input: {
  after?: number;
  from?: number;
  to?: number;
}): string {
  const search = new URLSearchParams();
  if (input.from !== undefined) {
    search.set("from", isoDay(input.from));
  }
  if (input.to !== undefined) {
    search.set("to", isoDay(input.to));
  }
  if (input.after !== undefined && input.after > 0) {
    search.set("after", String(Math.floor(input.after)));
  }
  const query = search.toString();
  return query ? `/history?${query}` : "/history";
}
