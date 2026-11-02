/**
 * The shape of a listen, as a bar.
 *
 * Ported from `mobile/src/lib/listeningTimeline.ts`. The History card says *that*
 * something was heard and for how long. This module answers the harder question a
 * listener actually has when they open one: **how much of it, and where** — which
 * is a question about the gap between what the track is and what was played of it.
 *
 * A listen is a sequence of tracks, so the bar is a sequence of segments: one per
 * member, each as wide as that track is long, each filled across the part that
 * was actually heard. Two properties fall out of that and neither would survive a
 * single flat bar:
 *
 *   - **A resumed listen looks resumed.** Starting at 30:00 of an hour shows a
 *     segment whose fill begins a third of the way in, not a bar that starts full.
 *   - **A half-heard course looks half-heard.** Twenty tracks where four were
 *     played is a strip with four filled segments, not "20% complete".
 *
 * ## What changed coming to the browser
 *
 * The phone's row is `{ session, track }`; the web's is one flat `HistorySession`
 * with the track as an optional relation, and the relation can be gone while the
 * session remains (a deleted track still happened). So a segment is identified by
 * its `trackId` *or* its `contentHash`, and the resume marker falls back to the
 * hash when the relation was lost — a marker that silently stopped moving on a
 * deleted track would be the bar lying about where the listener left off.
 *
 * Nothing here is stored and nothing here renders: it is arithmetic over the rows
 * the History screen already read, so it is testable without a browser.
 */

import type { HistorySession } from "@/lib/domain/history";
import { stretchResumeTarget, type ListeningStretch } from "@/lib/history";

/** One track's slice of the bar. */
export type TimelineSegment = {
  /** The session's id — one row, one segment. */
  key: string;
  /** Null when the relation was lost; `contentHash` still identifies the track. */
  trackId: string | null;
  contentHash: string;
  title: string;
  /** Seconds into the track the listen began. */
  fromSec: number;
  /** Seconds into the track it stopped; null while the session is still open. */
  toSec: number | null;
  /** The track's own length — the segment's denominator. */
  durationSec: number;
  /** Wall-clock seconds actually heard in this segment. */
  listenedSec: number;
  /** The listener scrubbed here, so the fill is a span rather than a proof. */
  seeked: boolean;
  /** This track ran out. */
  completed: boolean;
  /** Where the heard span begins, 0–1 of *this* track. */
  from: number;
  /** Where it ends, 0–1 of *this* track. */
  to: number;
  /** This track's share of the whole bar, 0–1. */
  weight: number;
};

export type ListeningTimeline = {
  segments: TimelineSegment[];
  /** Every member track's length, added up. */
  totalDurationSec: number;
  /** Wall-clock seconds heard, added up. Can exceed the total — replays count. */
  heardSec: number;
  /** Heard as a share of the whole, 0–1, clamped. */
  ratio: number;
  /** Where the resume marker sits across the bar, 0–1. */
  markerRatio: number;
  /** Anything in the listen was scrubbed. */
  seeked: boolean;
};

/** Where a resume would drop the playhead. The same target the row's button uses. */
export type ResumeTarget = {
  trackId: string | null;
  contentHash: string;
  positionSec: number;
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function segmentFor(member: HistorySession): TimelineSegment {
  const fromSec = Math.max(0, member.startPositionSec);
  /**
   * An open session has no end to draw. The phone stores `null` and draws
   * nothing; the web's column is a number, so the *absence of an end* is what
   * `endedAt === null` says. Guessing a fill from `endPositionSec` would let a
   * row that was synced mid-flight claim a span it never reported.
   */
  const toSec = member.endedAt === null ? null : Math.max(fromSec, member.endPositionSec);

  /**
   * The track's own length is the honest denominator. Where the source never
   * stated one — an online episode before it has been played, a truncated tag —
   * the furthest point reached stands in: a segment of zero width is a row nobody
   * can see, and the share it produced would be meaningless.
   */
  const statedDuration = member.track?.durationSec ?? 0;
  const durationSec = statedDuration > 0 ? statedDuration : Math.max(toSec ?? fromSec, 1);

  return {
    key: member.id,
    trackId: member.track?.id ?? null,
    contentHash: member.track?.contentHash ?? member.contentHash,
    title: member.track?.title ?? "Deleted track",
    fromSec,
    toSec,
    durationSec,
    listenedSec: Math.max(0, member.durationListenedSec),
    seeked: member.seeked,
    completed: member.completed,
    from: clamp01(fromSec / durationSec),
    to: clamp01((toSec ?? fromSec) / durationSec),
    weight: 0,
  };
}

/**
 * Lays out a listen as a bar.
 *
 * `resume` is passed in, not derived: it is the same target the row's button
 * seeks to, and the marker on the bar and the position the button lands on have
 * to be the same number or the sheet contradicts itself.
 */
export function buildListeningTimeline(
  members: readonly HistorySession[],
  resume: ResumeTarget,
): ListeningTimeline {
  const bare = members.map(segmentFor);
  const totalDurationSec = bare.reduce((total, segment) => total + segment.durationSec, 0);
  const heardSec = bare.reduce((total, segment) => total + segment.listenedSec, 0);

  const segments = bare.map((segment) => ({
    ...segment,
    weight: totalDurationSec > 0 ? segment.durationSec / totalDurationSec : 0,
  }));

  /**
   * The marker walks to the resume target's own segment, then across it by the
   * fraction of that track the position represents. `findIndex` takes the first
   * match: a stretch can hold the same track twice, and the resume target names
   * the track, not which of its passes — the first is where a listener would look
   * for it.
   */
  let markerRatio = 0;
  const index = segments.findIndex((segment) =>
    resume.trackId !== null
      ? segment.trackId === resume.trackId
      : segment.contentHash === resume.contentHash,
  );
  if (index >= 0) {
    const before = segments
      .slice(0, index)
      .reduce((total, segment) => total + segment.weight, 0);
    const target = segments[index];
    if (target) {
      markerRatio = clamp01(before + target.weight * clamp01(resume.positionSec / target.durationSec));
    }
  }

  return {
    segments,
    totalDurationSec,
    heardSec,
    // Clamped for drawing only. The number reported above is the truth: hearing a
    // ten-minute track twice is twenty minutes of listening, and a bar that said
    // otherwise would be the one place in the app that rounds it away.
    ratio: totalDurationSec > 0 ? clamp01(heardSec / totalDurationSec) : 0,
    markerRatio,
    seeked: segments.some((segment) => segment.seeked),
  };
}

/**
 * The bar for a whole listening stretch, with the row's own resume target.
 *
 * `stretchResumeTarget` already decides between "replay from where it began" and
 * "continue from where it stopped", and the row's button calls the same function
 * — so the marker cannot drift from the button by one rule.
 */
export function timelineForStretch(stretch: ListeningStretch): ListeningTimeline {
  const target = stretchResumeTarget(stretch);
  return buildListeningTimeline(stretch.members, {
    trackId: target.trackId,
    contentHash: target.contentHash,
    positionSec: target.positionSec,
  });
}
