/**
 * The dashboard's derived numbers.
 *
 * Everything here is a fold over rows the backend already returned. None of it
 * is stored, and none of it is fetched: a derived count kept anywhere — in the
 * database, in a store, in a `useState` — is a second source of truth that goes
 * stale on the next write (plan §15). These are pure functions so that they can
 * be tested without a backend, and so the page stays a rendering of decisions
 * rather than a place where decisions are made.
 */

import type { SessionSummary } from "./domain/session";
import type { TopTrack } from "./domain/stats";
import type { TrackSummary } from "./domain/track";
import { startOfDay } from "./time";

export type DailyBucket = {
  /** Midnight of the day, as an epoch millisecond — the bucket's identity. */
  day: number;
  listenTimeSec: number;
  sessionCount: number;
};

/**
 * Folds sessions into one bucket per day, oldest first, with empty days kept.
 *
 * Empty days are kept on purpose. A chart drawn only from days that had
 * listening compresses a month of silence into one step and makes an irregular
 * habit look continuous — the gap is the information.
 *
 * The day boundary comes from `startOfDay` (the machine's zone), not from a
 * formatted date string. Grouping on `fa-IR` text would bucket by the *calendar*
 * day in a fixed zone and disagree with the clock the listener is reading.
 */
export function bucketByDay(
  sessions: readonly SessionSummary[],
  days: number,
  now: number = Date.now(),
): DailyBucket[] {
  const span = Math.max(1, Math.floor(days));
  const today = startOfDay(now);

  const buckets: DailyBucket[] = [];
  const index = new Map<number, DailyBucket>();

  for (let offset = span - 1; offset >= 0; offset -= 1) {
    // `setDate` walks the calendar, so a DST change does not shift the series by
    // an hour and land a session in the neighbouring bucket.
    const date = new Date(today);
    date.setDate(date.getDate() - offset);
    const day = startOfDay(date.getTime());
    const bucket: DailyBucket = { day, listenTimeSec: 0, sessionCount: 0 };
    buckets.push(bucket);
    index.set(day, bucket);
  }

  for (const session of sessions) {
    const bucket = index.get(startOfDay(session.startedAt));
    // A session older than the window is not an error — the act's `from` is a
    // filter, but a clock skew can still land one just outside it.
    if (!bucket) {
      continue;
    }
    bucket.listenTimeSec += session.durationListenedSec;
    bucket.sessionCount += 1;
  }

  return buckets;
}

/** The busiest day in the window, for scaling a bar without a chart library. */
export function peakOf(buckets: readonly DailyBucket[]): number {
  let peak = 0;
  for (const bucket of buckets) {
    peak = Math.max(peak, bucket.listenTimeSec);
  }
  return peak;
}

/** A run of consecutive days with listening, ending at the most recent one. */
export function currentStreak(buckets: readonly DailyBucket[]): number {
  let streak = 0;
  for (let index = buckets.length - 1; index >= 0; index -= 1) {
    const bucket = buckets[index];
    if (!bucket || bucket.listenTimeSec <= 0) {
      break;
    }
    streak += 1;
  }
  return streak;
}

export type TopTrackRow = TopTrack & {
  /**
   * The track's `_id`, for the link to its page — `null` when the hash matched
   * nothing in the page of the library that was loaded.
   *
   * It is `null` rather than absent so that the table has one branch to write:
   * "a row with a track" and "a row without one" are the same question asked of
   * the same field, and a row that cannot link cannot pretend to.
   */
  id: string | null;
  /** `null` when the track is not in the library — see below. */
  title: string | null;
  durationSec: number | null;
};

/**
 * Joins the stats act's `contentHash` buckets to real tracks (plan §2 C4).
 *
 * A hash with no matching track is kept, with `title: null`, rather than
 * dropped. It means one of two things and both are worth seeing: the listener
 * played a track that is no longer in the library, or the library page that
 * supplied the titles was paginated and did not reach it. Dropping the row would
 * hide listening time from a table whose whole job is to account for it.
 */
export function joinTopTracks(
  topTracks: readonly TopTrack[],
  library: readonly TrackSummary[],
): TopTrackRow[] {
  const byHash = new Map<string, TrackSummary>();
  for (const track of library) {
    // First writer wins. Duplicate hashes across two rows is a data problem the
    // library screen reports; here it must not make a title flicker.
    if (!byHash.has(track.contentHash)) {
      byHash.set(track.contentHash, track);
    }
  }

  return topTracks.map((entry) => {
    const track = byHash.get(entry.contentHash);
    return {
      ...entry,
      id: track?.id ?? null,
      title: track?.title ?? null,
      durationSec: track?.durationSec ?? null,
    };
  });
}
