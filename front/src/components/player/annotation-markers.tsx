"use client";

/**
 * Annotation markers on the timeline.
 *
 * A marker is a real button, positioned with a logical `inset-inline-start`
 * percentage so the row begins at the right in RTL. It stops its own pointer
 * and click events: clicking a note must not also fire a scrub on the track
 * underneath.
 */

import { formatClockFa } from "@/lib/format";
import { markerOffsetRatio } from "@/lib/player/annotations";

export type TimelineMarker = {
  /** The display key shared with the note list, so selecting one can find the other. */
  id: string;
  positionSec: number;
  text: string;
  color: string;
};

export function AnnotationMarkers({
  markers,
  durationSec,
  onSelect,
}: {
  markers: readonly TimelineMarker[];
  durationSec: number;
  onSelect: (marker: TimelineMarker) => void;
}) {
  if (durationSec <= 0 || markers.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none absolute inset-0" aria-hidden={false}>
      {markers.map((marker) => {
        const ratio = markerOffsetRatio(marker.positionSec, durationSec);
        const time = formatClockFa(marker.positionSec);
        return (
          <button
            key={marker.id}
            type="button"
            className="pointer-events-auto absolute top-1/2 size-4 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-surface shadow-[var(--elevation-card)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
            style={{ insetInlineStart: `${ratio * 100}%`, backgroundColor: marker.color }}
            aria-label={`یادداشت در ${time}${marker.text ? `: ${marker.text}` : ""}`}
            title={marker.text ? `${time} — ${marker.text}` : time}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.stopPropagation();
              onSelect(marker);
            }}
          />
        );
      })}
    </div>
  );
}
