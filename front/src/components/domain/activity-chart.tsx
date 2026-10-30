/**
 * Thirty days of listening, one bar per day.
 *
 * ## Why this is not recharts
 *
 * The plan named recharts for the dashboard (§4). One bar chart does not earn a
 * client-side charting library: it would add a hydrated component and a bundle
 * to a page that is otherwise entirely server-rendered, and every charting
 * library needs its axis direction corrected for RTL — which is the one thing
 * this chart cannot get wrong. Thirty divs and a percentage height render on the
 * server, weigh nothing, and flow right-to-left because the document does.
 *
 * Revisit when a *second* chart needs interaction (zoom, tooltips, a shared
 * axis). One chart is a shape; two are a system.
 *
 * ## Why the empty days are drawn
 *
 * A chart built only from days that had listening compresses a month of silence
 * into one step and makes an irregular habit look continuous. The gap is the
 * information.
 */

import type { DailyBucket } from "@/lib/insights";
import { peakOf } from "@/lib/insights";
import { fa, formatSpan } from "@/lib/format";
import { formatDayHeading } from "@/lib/time";

export function ActivityChart({ buckets }: { buckets: readonly DailyBucket[] }) {
  const peak = peakOf(buckets);
  const total = buckets.reduce((sum, bucket) => sum + bucket.listenTimeSec, 0);

  if (buckets.length === 0) {
    return null;
  }

  const first = buckets[0];
  const last = buckets[buckets.length - 1];

  return (
    <figure className="flex flex-col gap-[var(--space-md)]">
      <figcaption className="flex items-baseline justify-between gap-[var(--space-sm)]">
        <p className="type-caption text-text-tertiary">
          {first ? formatDayHeading(first.day) : ""} تا {last ? formatDayHeading(last.day) : ""}
        </p>
        <p className="type-numeric text-text-secondary">
          {peak === 0 ? "بدون شنیدن" : `${formatSpan(total)} در ۳۰ روز`}
        </p>
      </figcaption>

      {peak === 0 ? (
        <p className="type-caption py-[var(--space-xxl)] text-center text-text-tertiary">
          در سی روز گذشته چیزی شنیده نشده است.
        </p>
      ) : (
        <div
          className="flex h-[168px] items-end gap-[3px]"
          role="img"
          aria-label={`نمودار شنیدن سی روز گذشته، مجموع ${formatSpan(total)}`}
        >
          {buckets.map((bucket) => {
            // A day with any listening gets at least 3% height: a bar of one
            // pixel is indistinguishable from a day with nothing, and the
            // difference between "a little" and "none" is the whole point.
            const ratio = bucket.listenTimeSec / peak;
            const height = bucket.listenTimeSec > 0 ? Math.max(3, Math.round(ratio * 100)) : 0;

            return (
              <div
                key={bucket.day}
                className="group relative flex-1 self-stretch rounded-t-[var(--radius-xs)]"
                title={
                  bucket.listenTimeSec > 0
                    ? `${formatDayHeading(bucket.day)} — ${formatSpan(bucket.listenTimeSec)}`
                    : `${formatDayHeading(bucket.day)} — بدون شنیدن`
                }
              >
                <div className="absolute inset-x-0 bottom-0 flex h-full items-end">
                  <div
                    className={
                      height > 0
                        ? "w-full rounded-t-[var(--radius-xs)] bg-accent/70 transition-colors group-hover:bg-accent"
                        : "h-px w-full bg-[var(--outline-variant)]"
                    }
                    style={height > 0 ? { height: `${height}%` } : undefined}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="type-caption text-text-tertiary">
        بیشترین روز: {peak === 0 ? "—" : formatSpan(peak)}
      </p>
    </figure>
  );
}

/** The chart's own numbers, for anyone who cannot read the bars. */
export function ActivitySummary({ buckets }: { buckets: readonly DailyBucket[] }) {
  const activeDays = buckets.filter((bucket) => bucket.listenTimeSec > 0).length;
  return (
    <p className="type-caption text-text-tertiary">
      {fa(activeDays)} روز از ۳۰ روز فعال بوده‌اید.
    </p>
  );
}
