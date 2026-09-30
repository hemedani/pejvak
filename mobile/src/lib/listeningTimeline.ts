/**
 * The shape of a listen, as a bar.
 *
 * The History card says *that* something was heard and for how long. This module
 * answers the harder question a listener actually has when they open one:
 * **how much of it, and where** — which is a question about the gap between what
 * the track is and what was played of it.
 *
 * A listen is a sequence of tracks, so the bar is a sequence of segments: one
 * per member, each as wide as that track is long, each filled across the part
 * that was actually heard. Two properties fall out of that and neither would
 * survive a single flat bar:
 *
 *   - **A resumed listen looks resumed.** Starting at 30:00 of an hour shows a
 *     segment whose fill begins a third of the way in, not a bar that starts full.
 *   - **A half-heard course looks half-heard.** Twenty tracks where four were
 *     played is a strip with four filled segments, not "20% complete".
 *
 * The resume marker is placed by the same rule that decides where tapping the
 * card drops the playhead — the caller passes the target in rather than this
 * module deriving one, because a second derivation is a second answer.
 *
 * Nothing here is stored and nothing here renders: it is arithmetic over the
 * rows the History screen already read, so it is testable without a device.
 */

import {
  stretchResumeTarget,
  type HistoryItem,
  type HistoryStretch,
} from "@/lib/history";

/** One track's slice of the bar. */
export type TimelineSegment = {
  /** The session's id — one row, one segment. */
  key: string;
  trackId: string;
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

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

function segmentFor(item: HistoryItem): TimelineSegment {
  const { session, track } = item;
  const fromSec = Math.max(0, session.startPositionSec);
  // Never before the start: a session whose end reads earlier than its beginning
  // is corrupt, and a negative width would draw the fill outside the segment.
  const toSec =
    session.endPositionSec === null ? null : Math.max(fromSec, session.endPositionSec);

  /**
   * The track's own length is the honest denominator. Where the source never
   * stated one — an online episode before it has been played, a truncated tag —
   * the furthest point reached stands in: a segment of zero width is a row
   * nobody can see, and the share it produced would be meaningless.
   */
  const durationSec =
    track.durationSec > 0 ? track.durationSec : Math.max(toSec ?? fromSec, 1);

  return {
    key: session.id,
    trackId: track.id,
    title: track.title,
    fromSec,
    toSec,
    durationSec,
    listenedSec: Math.max(0, session.durationListenedSec),
    seeked: session.seeked,
    completed: session.completed,
    from: clamp01(fromSec / durationSec),
    to: clamp01((toSec ?? fromSec) / durationSec),
    weight: 0,
  };
}

/**
 * Lays out a listen as a bar.
 *
 * `resume` is passed in, not derived: it is the same target the card uses, and
 * the marker on the bar and the position the Resume button seeks to have to be
 * the same number or the modal contradicts itself.
 */
export function buildListeningTimeline(
  items: readonly HistoryItem[],
  resume: { trackId: string; positionSec: number },
): ListeningTimeline {
  const bare = items.map(segmentFor);
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
   * the track, not which of its passes — the first is where a listener would
   * look for it.
   */
  let markerRatio = 0;
  const index = segments.findIndex((segment) => segment.trackId === resume.trackId);
  if (index >= 0) {
    const before = segments
      .slice(0, index)
      .reduce((total, segment) => total + segment.weight, 0);
    const target = segments[index];
    const across = clamp01(resume.positionSec / target.durationSec);
    markerRatio = clamp01(before + target.weight * across);
  }

  return {
    segments,
    totalDurationSec,
    heardSec,
    // Clamped for drawing only. The number reported above is the truth: hearing
    // a ten-minute track twice is twenty minutes of listening, and a bar that
    // said otherwise would be the one place in the app that rounds it away.
    ratio: totalDurationSec > 0 ? clamp01(heardSec / totalDurationSec) : 0,
    markerRatio,
    seeked: segments.some((segment) => segment.seeked),
  };
}

/**
 * The bar for a whole listening stretch, with the card's own resume target.
 *
 * `stretchResumeTarget` returns the *row* it resolved plus a position, not a
 * bare id — the card needs the row to render a title. The timeline needs only
 * the id, so the row is unwrapped here rather than the module being handed a
 * target whose `trackId` is `undefined` and whose marker therefore never moves.
 */
export function timelineForStretch(entry: HistoryStretch): ListeningTimeline {
  const target = stretchResumeTarget(entry);
  return buildListeningTimeline(entry.items, {
    trackId: target.item.track.id,
    positionSec: target.positionSec,
  });
}

/** The bar for a single session, resumed by the per-session rule. */
export function timelineForSession(
  item: HistoryItem,
  resume: { trackId: string; positionSec: number },
): ListeningTimeline {
  return buildListeningTimeline([item], resume);
}
