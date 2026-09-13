import type { LocalSession, LocalTrack } from "@/lib/db/types";
import { formatClock } from "@/lib/time";

export type HistoryItem = {
  session: LocalSession;
  track: Pick<LocalTrack, "id" | "title" | "author" | "contentHash">;
};

export type HistoryDay = {
  /** Local calendar date key, `YYYY-MM-DD`. */
  key: string;
  /** Human label: "Today", "Yesterday", or "Tue, Sep 8". */
  label: string;
  items: HistoryItem[];
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

/** Groups sessions into day buckets, newest day and newest session first. */
export function groupSessionsByDay(
  items: HistoryItem[],
  now: number = Date.now(),
): HistoryDay[] {
  const buckets = new Map<string, HistoryItem[]>();
  for (const item of items) {
    const key = dayKey(item.session.startedAt);
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

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
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
        items: [...bucket].sort((a, b) => b.session.startedAt - a.session.startedAt),
      };
    });
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
