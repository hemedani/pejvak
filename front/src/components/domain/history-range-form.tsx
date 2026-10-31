/**
 * The date range, as a GET form.
 *
 * ## Why a form and not a picker
 *
 * The URL is the state of this page, so the filter is a `<form method="get">`
 * with two native date inputs: it submits without JavaScript, the result is a
 * link the listener can bookmark, and Back undoes a filter the way it undoes a
 * page. A Jalali date picker would be a calendar library and a conversion table,
 * which is a different task; the native control's *display* follows the
 * browser's locale and is not ours to style.
 *
 * ## Why this is a Server Component
 *
 * It has no state: `defaultValue` comes from the parsed range, and submitting
 * replaces the query string. It is also why it draws its own label and input
 * instead of `TextField` — that component pairs its label with `useId`, and a
 * hook cannot run here. The track's classes are shared (`fieldTrackClass`), so
 * the control still looks like every other field.
 *
 * ## Changing the range drops the cursor
 *
 * The form carries only `from` and `to`, so submitting it produces a URL with no
 * `after` — which is the rule: page four of a different range does not exist.
 * Empty inputs are submitted as `?from=&to=`, which the parser reads as "no
 * bound", so clearing both dates and pressing the button is the same as the
 * «پاک کردن بازه» link.
 */

import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fieldTrackClass } from "@/components/ui/text-field";
import { cn } from "@/lib/cn";
import { isoDay, type HistoryRange } from "@/lib/history";
import { formatDate } from "@/lib/time";

export function HistoryRangeForm({ range }: { range: HistoryRange }) {
  const active = range.from !== undefined || range.to !== undefined;

  return (
    <Card className="px-[var(--space-lg)] py-[var(--space-lg)]">
      <form
        method="get"
        action="/history"
        className="flex flex-wrap items-end gap-[var(--space-md)]"
      >
        <DateField id="history-from" name="from" label="از تاریخ" value={range.from} />
        <DateField id="history-to" name="to" label="تا تاریخ" value={range.to} />

        <Button type="submit" variant="secondary" size="md">
          اعمال بازه
        </Button>

        {active ? (
          <Button asChild variant="ghost" size="md">
            <Link href="/history">پاک کردن بازه</Link>
          </Button>
        ) : null}
      </form>

      {range.invalid ? (
        // A reversed range is not an error state: the unfiltered history is
        // shown and this says why, so a hand-typed URL cannot make the page
        // refuse to render.
        <p className="type-caption mt-[var(--space-sm)] text-danger" role="status">
          بازهٔ نامعتبر بود؛ همهٔ تاریخچه نمایش داده می‌شود.
        </p>
      ) : active ? (
        <p className="type-caption mt-[var(--space-sm)] text-text-tertiary">
          {describeActiveRange(range)}
        </p>
      ) : null}
    </Card>
  );
}

/**
 * One bound of the range.
 *
 * `dir="ltr"` because the value is a Gregorian date read as three numbers in
 * order; in an RTL field the segments would start at the right edge and the year
 * would sit where the day belongs.
 */
function DateField({
  id,
  name,
  label,
  value,
}: {
  id: string;
  name: string;
  label: string;
  value: number | undefined;
}) {
  return (
    <div className="flex flex-col gap-[var(--space-sm)]">
      <label htmlFor={id} className="type-label text-text">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type="date"
        dir="ltr"
        defaultValue={value === undefined ? "" : isoDay(value)}
        className={cn(fieldTrackClass, "w-[190px]")}
      />
    </div>
  );
}

/** The active range in the listener's calendar, or `null` when there is none. */
function describeActiveRange(range: HistoryRange): string | null {
  if (range.from !== undefined && range.to !== undefined) {
    return `از ${formatDate(range.from)} تا ${formatDate(range.to)}`;
  }
  if (range.from !== undefined) {
    return `از ${formatDate(range.from)} به بعد`;
  }
  if (range.to !== undefined) {
    return `تا ${formatDate(range.to)}`;
  }
  return null;
}
