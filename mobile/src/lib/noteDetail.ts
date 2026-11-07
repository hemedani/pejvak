/**
 * What a note's own sheet says about it.
 *
 * A note is a sentence and a point in time, and the sheet that opens it has to
 * answer three questions the row cannot: *when* it was written, *where* in the
 * track it sits, and *which* other notes are nearby. The last one is the reason
 * there is a timeline at all — a marker alone would only repeat the clock that
 * is already on the row, while the same marker among its neighbours says
 * something new: "this is the fourth thing you noticed in this lecture, and the
 * other three are around it".
 *
 * Pure and separate from the sheet for the usual reason: this is arithmetic and
 * formatting over rows the screen already read, so it can be tested without a
 * device, and the sheet is left with nothing to decide.
 */

import type { AnnotationWithTrack, LocalAnnotation } from "@/lib/db/types";
import { formatClock } from "@/lib/time";

export type NoteFact = { label: string; value: string };

/** A tick on the track's bar: where a note sits, as a fraction of the track. */
export type NoteMarker = {
  id: string;
  /** 0–1 across the bar. */
  ratio: number;
  /** This is the note the sheet is open on. */
  current: boolean;
};

/** Route params that reopen the player where the note was written. */
export function noteResumeParams(note: AnnotationWithTrack): {
  trackId: string;
  positionSec: string;
} {
  return {
    trackId: note.track.id,
    positionSec: String(note.annotation.positionSec),
  };
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}

/**
 * Every note on a track, as ticks.
 *
 * A track whose length is unknown yields no markers rather than a bar of guesses:
 * the ratio would be a number divided by zero, and a marker pinned to the left
 * edge would be the sheet asserting a position it does not have. The sheet draws
 * no timeline in that case and keeps the clock, which is always true.
 *
 * The current note is included in the list rather than drawn separately, so the
 * bar cannot end up with two markers for one note.
 */
export function noteMarkers(
  durationSec: number | null,
  notes: readonly Pick<LocalAnnotation, "id" | "positionSec">[],
  currentId: string,
): NoteMarker[] {
  if (durationSec === null || durationSec <= 0) {
    return [];
  }
  return notes
    .map((note) => ({
      id: note.id,
      ratio: clamp01(note.positionSec / durationSec),
      current: note.id === currentId,
    }))
    .sort((a, b) => a.ratio - b.ratio);
}

/**
 * The line under the bar.
 *
 * Says only what the bar cannot: how many notes share the track. The position is
 * already drawn as the tall tick and stated in the facts, and repeating it here
 * was the same number three times on one screen.
 */
export function describeNoteTimeline(markerCount: number): string {
  if (markerCount <= 1) {
    return "The only note on this track";
  }
  return `${markerCount} notes on this track`;
}

/**
 * The facts list, in the order a listener would ask for them.
 *
 * Absent facts are left out rather than shown as an em dash: a row of blanks is
 * longer than the note it describes and says nothing. The date and the clock are
 * separate rows because they are separate questions — "when did I write this?"
 * is answered by a day, and "at what time of day?" by a time.
 */
export function describeNoteFacts(
  note: AnnotationWithTrack,
  durationSec: number | null,
): NoteFact[] {
  const { annotation, track } = note;
  const written = new Date(annotation.createdAt);
  const container = track.folderName ?? track.collectionTitle;

  const facts: NoteFact[] = [
    { label: "Date", value: written.toLocaleDateString() },
    {
      label: "Time",
      value: written.toLocaleTimeString(undefined, {
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
    {
      label: "Position",
      value:
        durationSec !== null && durationSec > 0
          ? `${formatClock(annotation.positionSec)} of ${formatClock(durationSec)}`
          : formatClock(annotation.positionSec),
    },
  ];

  if (container && container !== track.title) {
    facts.push({ label: "Collection", value: container });
  }
  if (track.author) {
    facts.push({ label: "Author", value: track.author });
  }
  if (annotation.tags.length > 0) {
    facts.push({
      label: "Tags",
      value: annotation.tags.map((tag) => `#${tag}`).join(" "),
    });
  }
  // Only when it is not the first listen: "written on play 1" is every note
  // ever written on a new track, and saying it on all of them is noise.
  if (annotation.timesPlayedBefore > 1) {
    facts.push({
      label: "Written on",
      value: `play ${annotation.timesPlayedBefore}`,
    });
  }

  return facts;
}
