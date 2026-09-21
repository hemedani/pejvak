import type { LocalSession, LocalTrack } from "@/lib/db/types";
import { groupSessionsIntoStretches, type ListeningStretch } from "@/lib/listeningStretch";
import { formatClock } from "@/lib/time";

export type HistoryItem = {
  session: LocalSession;
  /**
   * A projection, not a whole `LocalTrack`: the history card is text-only and
   * the join is on a 200-row list. `artworkUrl` is here because the playlist
   * picker opened from a history card shows the track's cover in its header.
   */
  track: Pick<
    LocalTrack,
    "id" | "title" | "author" | "contentHash" | "isAudiobook" | "artworkUrl"
  >;
  /**
   * The collection this session was part of, if it was part of one. Resolved in
   * the same query as the track, because "which folder was this?" is a caption
   * on every row of a 200-entry list.
   */
  contextTitle: string | null;
};

/**
 * One listening stretch, paired with the rows it was read from.
 *
 * The stretch alone is not enough to render: it carries ids and seconds, while
 * the card has to *name* the track the listen began on and the one it ended on,
 * and the track projection only exists on the joined rows. So the two travel
 * together and the pairing is done once, here, instead of in each card.
 */
export type HistoryStretch = {
  stretch: ListeningStretch;
  /** Members in listening order, paired with their track and collection. */
  items: HistoryItem[];
  /** The row the listen began on — the card's headline. */
  start: HistoryItem;
  /** The row it ended on; the same row as `start` for a single-track listen. */
  end: HistoryItem;
};

export type HistoryDay<T> = {
  /** Local calendar date key, `YYYY-MM-DD`. */
  key: string;
  /** Human label: "Today", "Yesterday", or "Tue, Sep 8". */
  label: string;
  items: T[];
};

/** Chronological order of the day buckets. */
export type HistoryOrder = "newest" | "oldest";

/** How the History screen orders its entries. */
export type HistorySort = HistoryOrder | "longest";

export const HISTORY_SORT_OPTIONS: { value: HistorySort; label: string }[] = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "longest", label: "Longest" },
];

/**
 * A rendered block of the History list. `title` is `null` for sorts that are not
 * chronological, where a day heading would be meaningless.
 *
 * Generic over the row so the two halves of the screen — stretches and
 * collection runs — share one shape and one renderer.
 */
export type HistorySection<T = HistoryStretch> = {
  key: string;
  title: string | null;
  data: T[];
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** Local calendar date key for grouping, independent of the UTC offset. */
export function dayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * Groups arbitrary timestamped rows into day buckets, newest day and newest row
 * first by default. Pass `order: "oldest"` to flip both the days and the rows
 * inside them; the grouping itself is unaffected.
 *
 * Generic over the row so the sessions list and the collections list share one
 * implementation — two copies of "which day is this, and what is that day
 * called?" would eventually label the same date two different ways.
 */
export function groupByDay<T>(
  items: readonly T[],
  timestampOf: (item: T) => number,
  now: number = Date.now(),
  order: HistoryOrder = "newest",
): HistoryDay<T>[] {
  const buckets = new Map<string, T[]>();
  for (const item of items) {
    const key = dayKey(timestampOf(item));
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.push(item);
    } else {
      buckets.set(key, [item]);
    }
  }

  const todayKey = dayKey(now);
  const previous = new Date(now);
  previous.setDate(previous.getDate() - 1);
  const yesterdayKey = dayKey(previous.getTime());

  // Keys are `YYYY-MM-DD`, so a string compare is already chronological.
  const direction = order === "oldest" ? -1 : 1;

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? direction : -direction))
    .map(([key, bucket]) => {
      const date = new Date(`${key}T00:00:00`);
      const label =
        key === todayKey
          ? "Today"
          : key === yesterdayKey
            ? "Yesterday"
            : `${WEEKDAYS[date.getDay()]}, ${MONTHS[date.getMonth()]} ${date.getDate()}`;
      return {
        key,
        label,
        items: [...bucket].sort((a, b) => (timestampOf(b) - timestampOf(a)) * direction),
      };
    });
}

/**
 * Pairs each stretch with the rows it was built from.
 *
 * The grouping itself is the pure model's job; this only re-attaches the track
 * and collection columns the query joined on. A stretch whose rows are missing
 * is dropped rather than rendered as a nameless card — the caller's query
 * returns every member of every stretch it selected, so a gap here means the
 * list was assembled from somewhere else and the card would be lying.
 */
export function groupHistoryIntoStretches(
  items: readonly HistoryItem[],
): HistoryStretch[] {
  const bySessionId = new Map(items.map((item) => [item.session.id, item]));

  return groupSessionsIntoStretches(items.map((item) => item.session))
    .map((stretch) => {
      // `members` is already in listening order, so the first and last rows are
      // the stretch's own start and end — no second ordering to disagree with
      // the one that decided `startTrackId`.
      const ordered = stretch.members
        .map((session) => bySessionId.get(session.id))
        .filter((item): item is HistoryItem => item !== undefined);
      const start = ordered[0];
      const end = ordered[ordered.length - 1];
      return start && end ? { stretch, items: ordered, start, end } : null;
    })
    .filter((entry): entry is HistoryStretch => entry !== null);
}

/**
 * The History screen's list model.
 *
 * Chronological sorts keep their day headings, bucketed by the day the *listen
 * began* — a stretch that ran past midnight belongs to the evening it started,
 * which is where the listener would look for it.
 *
 * "Longest" is deliberately flat: how long a listen ran has nothing to do with
 * the day it happened, so a section header there would be noise.
 */
export function buildStretchSections(
  stretches: readonly HistoryStretch[],
  sort: HistorySort = "newest",
  now: number = Date.now(),
): HistorySection<HistoryStretch>[] {
  if (sort === "longest") {
    return [
      {
        key: "longest",
        title: null,
        data: [...stretches].sort(
          (a, b) =>
            b.stretch.listenedSec - a.stretch.listenedSec ||
            b.stretch.startedAt - a.stretch.startedAt,
        ),
      },
    ];
  }

  return groupByDay(stretches, (entry) => entry.stretch.startedAt, now, sort).map((day) => ({
    key: day.key,
    title: day.label,
    data: day.items,
  }));
}

/**
 * Where tapping a history entry should drop the playhead.
 *
 * A finished session has nothing left to resume — seeking to its end would
 * complete the track the instant it started — so a completed entry replays from
 * the point that session began. Anything else continues from where it stopped,
 * falling back to the start position while a session is still in progress.
 *
 * Kept for the per-session cards (`track/[id].tsx` and the stats screen), which
 * list single tracks rather than stretches.
 */
export function resumeTargetSec(item: HistoryItem): number {
  const { completed, endPositionSec, startPositionSec } = item.session;
  if (completed) {
    return Math.max(0, startPositionSec);
  }
  return Math.max(0, endPositionSec ?? startPositionSec);
}

/**
 * The row tapping a stretch should reopen, and where inside it.
 *
 * The position and the track have to come from the same end of the stretch: a
 * completed listen replays its first track from its opening second, while an
 * unfinished one continues the *last* track it reached. Pairing the start track
 * with the end track's offset would drop the listener minutes into a file they
 * never played.
 */
export function stretchResumeTarget(entry: HistoryStretch): {
  item: HistoryItem;
  positionSec: number;
} {
  const { stretch } = entry;
  if (stretch.completed) {
    return { item: entry.start, positionSec: Math.max(0, stretch.startPositionSec) };
  }
  return {
    item: entry.end,
    positionSec: Math.max(0, stretch.endPositionSec ?? stretch.startPositionSec),
  };
}

/**
 * The headline for a stretch: the track it began on, and — when it covered more
 * than one — the track it ended on.
 *
 * Both ends are shown because that is the whole point of a stretch: "chapter 4"
 * alone does not say whether the listener got through chapter 7. A single-track
 * listen says its title once rather than repeating it either side of an arrow.
 */
export function describeStretchTitle(entry: HistoryStretch): string {
  if (entry.stretch.trackCount <= 1) {
    return entry.start.track.title;
  }
  return `${entry.start.track.title} → ${entry.end.track.title}`;
}

/** Compact listened-time label: "45s", "1m 30s", "2h 2m". */
export function formatDuration(totalSec: number): string {
  const seconds = Math.max(0, Math.floor(Number.isFinite(totalSec) ? totalSec : 0));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    const rem = seconds % 60;
    return rem > 0 ? `${minutes}m ${rem}s` : `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hours}h ${rem}m` : `${hours}h`;
}

function clockTime(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** "09:15 – 09:22", or "09:15 – in progress" while the session is open. */
export function formatTimeRange(startedAt: number, endedAt: number | null): string {
  return endedAt === null
    ? `${clockTime(startedAt)} – in progress`
    : `${clockTime(startedAt)} – ${clockTime(endedAt)}`;
}

export function describeSpeed(speed: number): string {
  return `${speed}×`;
}

/** Position range within the track: "12:30 – 45:10", or "– in progress". */
export function formatPositionRange(
  startPositionSec: number,
  endPositionSec: number | null,
): string {
  return endPositionSec === null
    ? `${formatClock(startPositionSec)} – in progress`
    : `${formatClock(startPositionSec)} – ${formatClock(endPositionSec)}`;
}
