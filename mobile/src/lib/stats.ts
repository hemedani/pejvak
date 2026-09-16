/**
 * Listening statistics, derived from the same `HistoryItem[]` the History screen
 * shows — so the two can never disagree.
 *
 * Every figure here is computed from *finalized* sessions (those with an
 * `endedAt`), matching the daily bar chart. A session still in progress has not
 * finished accruing time, so counting it would make the totals jump around.
 *
 * The functions also carry the identity needed to route from a stat to the thing
 * it describes: a leader knows its track id, and the longest session knows its
 * track and the position to replay from. Without those the cards could only be
 * read, not tapped.
 */

import type { HistoryItem } from "@/lib/history";
import { dayKey, resumeTargetSec } from "@/lib/history";

export type ListeningStats = {
  totalListenTimeSec: number;
  sessionCount: number;
  trackCount: number;
  lastPlayedAt: number | null;
  longestSessionSec: number;
  longestSessionTitle: string | null;
  /** Track the longest session belongs to, so the card can open it. */
  longestSessionTrackId: string | null;
  /** Where to drop the playhead when replaying the longest session. */
  longestSessionPositionSec: number;
  /** Mean listened time per finalized session; 0 when there are none. */
  averageSessionSec: number;
  /** Distinct local days with listening. */
  activeDayCount: number;
};

export type TrackLeader = {
  contentHash: string;
  /** Local track id, so a leader row can open that track's detail screen. */
  trackId: string;
  title: string;
  listenTimeSec: number;
  playCount: number;
};

export type DailyListen = {
  key: string;
  listenTimeSec: number;
};

/** How the listened time splits between audiobooks and music. */
export type MediaBreakdown = {
  audiobookSec: number;
  musicSec: number;
};

function finalized(items: HistoryItem[]): HistoryItem[] {
  return items.filter((item) => item.session.endedAt !== null);
}

export function computeListeningStats(items: HistoryItem[]): ListeningStats {
  const done = finalized(items);
  const hashes = new Set<string>();
  const days = new Set<string>();
  let totalListenTimeSec = 0;
  let longestSessionSec = 0;
  let longestSessionTitle: string | null = null;
  let longestSessionTrackId: string | null = null;
  let longestSessionPositionSec = 0;

  for (const item of done) {
    totalListenTimeSec += item.session.durationListenedSec;
    hashes.add(item.session.contentHash);
    days.add(dayKey(item.session.startedAt));
    if (item.session.durationListenedSec > longestSessionSec) {
      longestSessionSec = item.session.durationListenedSec;
      longestSessionTitle = item.track.title;
      longestSessionTrackId = item.track.id;
      // Shares the History screen's rule, so "replay" means the same thing in
      // both places.
      longestSessionPositionSec = resumeTargetSec(item);
    }
  }

  let lastPlayedAt: number | null = null;
  for (const item of items) {
    const at = item.session.endedAt ?? item.session.startedAt;
    if (lastPlayedAt === null || at > lastPlayedAt) {
      lastPlayedAt = at;
    }
  }

  return {
    totalListenTimeSec,
    sessionCount: done.length,
    trackCount: hashes.size,
    lastPlayedAt,
    longestSessionSec,
    longestSessionTitle,
    longestSessionTrackId,
    longestSessionPositionSec,
    averageSessionSec: done.length > 0 ? Math.round(totalListenTimeSec / done.length) : 0,
    activeDayCount: days.size,
  };
}

export function computeTrackLeaders(items: HistoryItem[], limit = 5): TrackLeader[] {
  const leaders = new Map<string, TrackLeader>();

  for (const item of finalized(items)) {
    const key = item.session.contentHash;
    const existing = leaders.get(key);
    if (existing) {
      existing.listenTimeSec += item.session.durationListenedSec;
      existing.playCount += 1;
    } else {
      leaders.set(key, {
        contentHash: key,
        trackId: item.track.id,
        title: item.track.title,
        listenTimeSec: item.session.durationListenedSec,
        playCount: 1,
      });
    }
  }

  return [...leaders.values()]
    .sort((a, b) => b.listenTimeSec - a.listenTimeSec || a.title.localeCompare(b.title))
    .slice(0, limit);
}

export function computeDailyListen(items: HistoryItem[]): DailyListen[] {
  const buckets = new Map<string, number>();

  for (const item of finalized(items)) {
    const key = dayKey(item.session.startedAt);
    buckets.set(key, (buckets.get(key) ?? 0) + item.session.durationListenedSec);
  }

  return [...buckets.entries()]
    .sort((a, b) => (a[0] < b[0] ? -1 : 1))
    .map(([key, listenTimeSec]) => ({ key, listenTimeSec }));
}

/** Consecutive days with listening, anchored at today or (if idle today) yesterday. */
export function computeDayStreak(items: HistoryItem[], now: number = Date.now()): number {
  const active = new Set<string>();
  for (const item of finalized(items)) {
    active.add(dayKey(item.session.startedAt));
  }
  if (active.size === 0) {
    return 0;
  }

  const cursor = new Date(now);
  if (!active.has(dayKey(cursor.getTime()))) {
    cursor.setDate(cursor.getDate() - 1);
    if (!active.has(dayKey(cursor.getTime()))) {
      return 0;
    }
  }

  let streak = 0;
  while (active.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The next calendar day's key. Steps through `Date` so DST cannot break it. */
function nextDayKey(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  date.setDate(date.getDate() + 1);
  return dayKey(date.getTime());
}

/**
 * The longest run of consecutive listening days ever recorded — the personal
 * best behind the current streak.
 */
export function computeBestStreak(items: HistoryItem[]): number {
  const active = new Set<string>();
  for (const item of finalized(items)) {
    active.add(dayKey(item.session.startedAt));
  }
  if (active.size === 0) {
    return 0;
  }

  const keys = [...active].sort();
  let best = 1;
  let run = 1;
  for (let index = 1; index < keys.length; index += 1) {
    const previous = keys[index - 1];
    const current = keys[index];
    const consecutive =
      previous !== undefined && current !== undefined && nextDayKey(previous) === current;
    run = consecutive ? run + 1 : 1;
    if (run > best) {
      best = run;
    }
  }
  return best;
}

/** Finalized sessions started on one local day, newest first. */
export function sessionsOnDay(items: HistoryItem[], key: string): HistoryItem[] {
  return finalized(items)
    .filter((item) => dayKey(item.session.startedAt) === key)
    .sort((a, b) => b.session.startedAt - a.session.startedAt);
}

/**
 * Splits listened time by media type. The app is built around audiobooks and
 * music alike, and this is the one place that answers "where did my time
 * actually go?".
 */
export function computeMediaBreakdown(items: HistoryItem[]): MediaBreakdown {
  let audiobookSec = 0;
  let musicSec = 0;

  for (const item of finalized(items)) {
    if (item.track.isAudiobook) {
      audiobookSec += item.session.durationListenedSec;
    } else {
      musicSec += item.session.durationListenedSec;
    }
  }

  return { audiobookSec, musicSec };
}
