import type { HistoryItem } from "@/lib/history";
import { dayKey } from "@/lib/history";

export type ListeningStats = {
  totalListenTimeSec: number;
  sessionCount: number;
  trackCount: number;
  lastPlayedAt: number | null;
  longestSessionSec: number;
  longestSessionTitle: string | null;
};

export type TrackLeader = {
  contentHash: string;
  title: string;
  listenTimeSec: number;
  playCount: number;
};

export type DailyListen = {
  key: string;
  listenTimeSec: number;
};

function finalized(items: HistoryItem[]): HistoryItem[] {
  return items.filter((item) => item.session.endedAt !== null);
}

export function computeListeningStats(items: HistoryItem[]): ListeningStats {
  const done = finalized(items);
  const hashes = new Set<string>();
  let totalListenTimeSec = 0;
  let longestSessionSec = 0;
  let longestSessionTitle: string | null = null;

  for (const item of done) {
    totalListenTimeSec += item.session.durationListenedSec;
    hashes.add(item.session.contentHash);
    if (item.session.durationListenedSec > longestSessionSec) {
      longestSessionSec = item.session.durationListenedSec;
      longestSessionTitle = item.track.title;
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
