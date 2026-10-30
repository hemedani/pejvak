/**
 * A playback session — one continuous period of listening.
 *
 * The dashboard needs these for one reason the stats act cannot serve: a
 * per-day chart. `getMyStats` aggregates totals over all time; it has no time
 * buckets, and adding them there would put a second aggregation of the same
 * rows in a second act. The history act already returns the rows, so the chart
 * is a fold over them.
 */

import { asArray, asBoolean, asInt, asNumber, asRecord, asString, asTimestamp } from "../parse";

export type SessionSummary = {
  id: string;
  contentHash: string | null;
  startedAt: number;
  endedAt: number | null;
  durationListenedSec: number;
  completed: boolean;
  interrupted: boolean;
  seeked: boolean;
};

export const SESSION_SUMMARY_GET = {
  _id: 1,
  contentHash: 1,
  startedAt: 1,
  endedAt: 1,
  durationListenedSec: 1,
  completed: 1,
  interrupted: 1,
  seeked: 1,
} as const;

export function parseSession(raw: unknown): SessionSummary | null {
  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  const id = asString(record._id);
  const startedAt = asTimestamp(record.startedAt);
  if (!id || startedAt === null) {
    return null;
  }

  return {
    id,
    contentHash: asString(record.contentHash),
    startedAt,
    endedAt: asTimestamp(record.endedAt),
    durationListenedSec: asInt(record.durationListenedSec) ?? 0,
    completed: asBoolean(record.completed),
    interrupted: asBoolean(record.interrupted),
    seeked: asBoolean(record.seeked),
  };
}

export function parseSessionList(raw: unknown): SessionSummary[] {
  return asArray(raw)
    .map(parseSession)
    .filter((session): session is SessionSummary => session !== null);
}

/**
 * One session, with the shape of the listen rather than just its size.
 *
 * The dashboard only ever needs "how much, when" (`SessionSummary`). A track's
 * timeline needs *where*: `startPositionSec` → `endPositionSec` is what makes
 * "heard from 12:04 to 41:10" say something an audiobook listener can use, and
 * `playbackSpeed` is the difference between 40 minutes of audio and 40 minutes
 * of a person's life.
 *
 * Kept as a second shape rather than widening `SessionSummary`, for the same
 * reason `TrackDetail` exists beside `TrackSummary`: a shared type with
 * half-filled fields forces every reader to handle `undefined` for data it
 * never asked for.
 */
export type SessionDetail = SessionSummary & {
  startPositionSec: number;
  endPositionSec: number;
  playbackSpeed: number;
  /** The continuous listen this session belongs to, if the phone grouped it. */
  stretchId: string | null;
  contextType: string | null;
};

export const SESSION_TIMELINE_GET = {
  ...SESSION_SUMMARY_GET,
  startPositionSec: 1,
  endPositionSec: 1,
  playbackSpeed: 1,
  stretchId: 1,
  contextType: 1,
} as const;

export function parseSessionDetail(raw: unknown): SessionDetail | null {
  const summary = parseSession(raw);
  if (!summary) {
    return null;
  }

  const record = asRecord(raw);
  if (!record) {
    return null;
  }

  return {
    ...summary,
    startPositionSec: asInt(record.startPositionSec) ?? 0,
    endPositionSec: asInt(record.endPositionSec) ?? 0,
    // A missing speed is 1×, not 0× — 0 would render "۰×" beside every row the
    // phone recorded before it started sending the field.
    playbackSpeed: asNumber(record.playbackSpeed) ?? 1,
    stretchId: asString(record.stretchId),
    contextType: asString(record.contextType),
  };
}

export function parseSessionDetailList(raw: unknown): SessionDetail[] {
  return asArray(raw)
    .map(parseSessionDetail)
    .filter((session): session is SessionDetail => session !== null);
}
