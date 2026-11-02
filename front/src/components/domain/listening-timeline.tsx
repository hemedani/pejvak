/**
 * A listen, drawn as a bar.
 *
 * Ported from `mobile/src/components/session-detail/ListeningTimeline.tsx`. The
 * strip is a sequence of segments — one per track the listen covered, each as
 * wide as that track is long — and each segment is filled across the part that
 * was actually heard. So the picture answers "how much of this did I get through,
 * and where" in one glance, which a percentage cannot: twenty tracks with four
 * played is a strip with four filled segments, not "20%".
 *
 * Two details carry meaning rather than decoration:
 *
 *   - **The marker is the resume point**, placed by the same number the Continue
 *     button seeks to. It is drawn in the text colour rather than the accent
 *     because it is a position, not a quantity — the accent is already saying
 *     "heard".
 *   - **A scrubbed segment is drawn lighter.** A seek makes the fill a *span*
 *     rather than a record of what was heard through, and pretending otherwise
 *     would be the bar claiming something the session row explicitly flagged as
 *     unknown.
 *
 * The strip is `role="img"` with the caption as its label: it is a picture of
 * numbers the caption already states, and a screen reader should get the sentence
 * rather than twenty unlabelled boxes.
 */

import { formatSpan } from "@/lib/format";
import type { ListeningTimeline } from "@/lib/listeningTimeline";
import { withAlpha } from "@/lib/palette";
import { formatClock } from "@/lib/time";

/** Height of the strip. Tall enough that a 30-second fill is still visible. */
const STRIP_HEIGHT = 28;

/** A fraction as a percentage string, for the inset properties. */
function pct(value: number): `${number}%` {
  return `${Math.max(0, Math.min(1, value)) * 100}%`;
}

export function ListeningTimelineBar({
  timeline,
  /** The listen's own colour, so the bar matches the card that opened the sheet. */
  tint,
}: {
  timeline: ListeningTimeline;
  tint: string;
}) {
  const { segments, totalDurationSec, heardSec, markerRatio, seeked } = timeline;
  const empty = segments.length === 0;

  /**
   * The caption states the two numbers the bar cannot: how much time that was,
   * and whether any of it was jumped. "42m of 1h 10m" is the figure a listener
   * repeats to themselves; the strip is only the shape of it.
   */
  const caption = empty
    ? "Nothing was heard in this session."
    : `${formatSpan(heardSec)} heard of ${formatSpan(totalDurationSec)}${
        segments.length > 1 ? ` · ${segments.length} tracks` : ""
      }${seeked ? " · includes a jump" : ""}`;

  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <div className="relative" style={{ height: STRIP_HEIGHT }}>
        <div
          role="img"
          aria-label={caption}
          className="flex h-full items-stretch gap-[3px]"
        >
          {segments.map((segment) => (
            <div
              key={segment.key}
              className="relative overflow-hidden rounded-[var(--radius-xs)]"
              style={{
                flexGrow: segment.durationSec,
                flexBasis: 0,
                backgroundColor: withAlpha(tint, 0.14),
              }}
              title={
                segment.toSec === null
                  ? `${segment.title} — still listening`
                  : `${segment.title} — ${formatClock(segment.fromSec)} to ${formatClock(segment.toSec)}`
              }
            >
              <span
                aria-hidden
                className="absolute inset-y-0"
                style={{
                  insetInlineStart: pct(segment.from),
                  insetInlineEnd: pct(1 - segment.to),
                  backgroundColor: tint,
                  opacity: segment.seeked ? 0.55 : 1,
                }}
              />
            </div>
          ))}
        </div>

        {/*
          A sibling of the strip, not a child: the strip clips its segments (each
          is a rounded box), and a marker inside it would be cut off at the edge
          of whichever segment it landed in. It overhangs by 4px on each side so
          it reads as a pin rather than as one more tick.
        */}
        <span
          aria-hidden
          className="pointer-events-none absolute -top-1 -bottom-1 w-[2px] -translate-x-1/2 rounded-[var(--radius-pill)] bg-text"
          style={{ insetInlineStart: pct(markerRatio) }}
        />
      </div>

      <div className="type-numeric flex justify-between text-text-tertiary">
        <span>{formatClock(0)}</span>
        <span>{formatClock(totalDurationSec)}</span>
      </div>

      <p className="type-caption text-text-secondary">{caption}</p>
    </div>
  );
}
