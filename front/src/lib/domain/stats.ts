/**
 * `getMyStats` — the dashboard's numbers.
 *
 * One thing to keep in mind while reading this: the act returns **hashes, not
 * titles** (plan §2 C4). `tracks[]` is grouped by `contentHash` and carries no
 * name, so the top-tracks table joins against `getMyTracks` to find one. The
 * join belongs on the page, not in the act — a title in the stats payload would
 * make the stats act a second source of truth for a track's name, and the two
 * would disagree the first time a track was renamed.
 */

import { asArray, asInt, asRecord, asString, asTimestamp } from "../parse";

export type TopTrack = {
  contentHash: string;
  listenTimeSec: number;
  playCount: number;
  lastPlayedAt: number | null;
};

export type ListeningStats = {
  totalListenTimeSec: number;
  sessionCount: number;
  /** Distinct `contentHash`es heard — not the library size. */
  trackCount: number;
  firstListenedAt: number | null;
  lastListenedAt: number | null;
  /** The ten loudest tracks, already sorted by listen time. Titles are absent. */
  topTracks: TopTrack[];
};

export const STATS_GET = {
  totalListenTimeSec: 1,
  sessionCount: 1,
  trackCount: 1,
  firstListenedAt: 1,
  lastListenedAt: 1,
  tracks: {
    contentHash: 1,
    listenTimeSec: 1,
    playCount: 1,
    lastPlayedAt: 1,
  },
} as const;

export const EMPTY_STATS: ListeningStats = {
  totalListenTimeSec: 0,
  sessionCount: 0,
  trackCount: 0,
  firstListenedAt: null,
  lastListenedAt: null,
  topTracks: [],
};

export function parseStats(raw: unknown): ListeningStats {
  const record = asRecord(raw);
  if (!record) {
    return EMPTY_STATS;
  }

  const topTracks: TopTrack[] = [];
  for (const entry of asArray(record.tracks)) {
    const row = asRecord(entry);
    const contentHash = row ? asString(row.contentHash) : null;
    if (!row || !contentHash) {
      continue;
    }
    topTracks.push({
      contentHash,
      listenTimeSec: asInt(row.listenTimeSec) ?? 0,
      playCount: asInt(row.playCount) ?? 0,
      lastPlayedAt: asTimestamp(row.lastPlayedAt),
    });
  }

  return {
    totalListenTimeSec: asInt(record.totalListenTimeSec) ?? 0,
    sessionCount: asInt(record.sessionCount) ?? 0,
    trackCount: asInt(record.trackCount) ?? 0,
    firstListenedAt: asTimestamp(record.firstListenedAt),
    lastListenedAt: asTimestamp(record.lastListenedAt),
    topTracks,
  };
}
