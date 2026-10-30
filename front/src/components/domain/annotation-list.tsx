/**
 * The notes on a track, as a marker row and a list.
 *
 * ## The order is the backend's
 *
 * `getTrackDetail` embeds `annotations` through a relation declared with
 * `sort: { field: "positionSec", order: "asc" }` and `limit: 1000`
 * (`models/annotation.ts`). That is already the order a marker row needs, so
 * nothing here sorts — a second sort would be a second opinion about order, and
 * the two would disagree the day the relation's sort changed.
 *
 * ## A note is not always prose
 *
 * `text` may be empty: a marker with tags and no sentence is a legitimate thing
 * to leave in an audiobook. An empty note renders as a stated absence rather
 * than as a blank line, because a blank line reads as a rendering bug.
 *
 * ## The colour is the listener's
 *
 * `color` is whatever the phone stored — a hex value. It is validated before it
 * is used: an invalid CSS colour makes the tick invisible, and a note the
 * listener coloured red would silently disappear from the rail. Anything that
 * is not a hex colour falls back to the accent, so the tick is always drawn.
 */

import { Badge } from "@/components/ui/badge";
import { Icon } from "@/components/ui/icon";
import type { Annotation } from "@/lib/domain/annotation";
import { fa, formatClockFa } from "@/lib/format";

/** `#abc` and `#aabbcc` only. Anything else is the phone's problem, not the page's. */
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export function AnnotationPanel({
  annotations,
  durationSec,
}: {
  annotations: readonly Annotation[];
  durationSec: number;
}) {
  if (annotations.length === 0) {
    return (
      <div className="flex items-start gap-[var(--space-md)]">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-sunken text-text-tertiary"
        >
          <Icon name="note" size="md" />
        </span>
        <div>
          <p className="type-body-strong text-text">یادداشتی روی این ترک نیست</p>
          <p className="type-caption mt-[var(--space-xs)] max-w-[54ch] text-text-tertiary">
            یادداشت‌ها از اپلیکیشن موبایل همگام می‌شوند؛ در نسخهٔ وب فعلاً فقط خوانده می‌شوند.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      {durationSec > 0 ? <MarkerRail annotations={annotations} durationSec={durationSec} /> : null}
      <AnnotationList annotations={annotations} />
    </div>
  );
}

/**
 * Where the notes sit in the track.
 *
 * The ticks are positioned with `inset-inline-start`, so the rail runs with the
 * text: in RTL the start of the track is at the right-hand edge, which is where
 * a Persian reader begins. A percentage from `left` would put 0% at the far end
 * of the track for every reader of this app.
 */
function MarkerRail({
  annotations,
  durationSec,
}: {
  annotations: readonly Annotation[];
  durationSec: number;
}) {
  return (
    <div
      className="relative h-2 rounded-[var(--radius-pill)] bg-surface-sunken"
      role="img"
      aria-label={`${fa(annotations.length)} یادداشت روی خط زمانی این ترک`}
    >
      {annotations.map((annotation) => {
        const percent = Math.min(100, Math.max(0, (annotation.positionSec / durationSec) * 100));
        const tint =
          annotation.color !== null && HEX_COLOR.test(annotation.color)
            ? annotation.color
            : "var(--accent)";

        return (
          <span
            key={annotation.id}
            className="absolute top-0 h-full w-[2px] rounded-[var(--radius-pill)]"
            style={{ insetInlineStart: `${percent}%`, backgroundColor: tint }}
          />
        );
      })}
    </div>
  );
}

function AnnotationList({ annotations }: { annotations: readonly Annotation[] }) {
  return (
    <ol className="flex flex-col divide-y divide-outline-variant">
      {annotations.map((annotation) => (
        <li key={annotation.id} className="flex gap-[var(--space-md)] py-[var(--space-md)] first:pt-0 last:pb-0">
          <span className="type-numeric shrink-0 pt-[1px] text-text-tertiary">
            {formatClockFa(annotation.positionSec)}
          </span>

          <div className="min-w-0 flex-1">
            {annotation.text.length > 0 ? (
              <p className="type-body whitespace-pre-wrap break-words text-text">{annotation.text}</p>
            ) : (
              <p className="type-caption text-text-tertiary">بدون متن — فقط نشانه</p>
            )}

            {annotation.tags.length > 0 || annotation.timesPlayedBefore > 0 ? (
              <div className="mt-[var(--space-xs)] flex flex-wrap items-center gap-[var(--space-xs)]">
                {annotation.tags.map((tag) => (
                  <Badge key={tag} tone="neutral" size="sm">
                    {tag}
                  </Badge>
                ))}
                {annotation.timesPlayedBefore > 0 ? (
                  <span className="type-caption text-text-tertiary">
                    {fa(annotation.timesPlayedBefore)} بار پیش‌تر شنیده شده
                  </span>
                ) : null}
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}
