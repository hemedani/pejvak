import { Suspense } from "react";

import { getHistoryPage } from "@/app/actions/sessions/get-history-page";
import { HistoryRangeForm } from "@/components/domain/history-range-form";
import { HistorySections, HistorySkeleton } from "@/components/domain/history-sections";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CursorPagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/state";
import {
  buildHistoryHref,
  buildHistorySections,
  describeHistorySummary,
  parseHistoryRange,
  type HistoryRange,
} from "@/lib/history";
import { now as clock } from "@/lib/now";
import { afterParam, firstParam, type SearchParamValue } from "@/lib/search-params";

export const metadata = { title: "تاریخ شنیدن" };

type Search = {
  after?: SearchParamValue;
  from?: SearchParamValue;
  to?: SearchParamValue;
};

/**
 * What the listener actually heard.
 *
 * ## Stretches, not sessions
 *
 * A session is one track played through; a stretch is everything heard without
 * deliberately changing track. The list shows stretches, because eight rows for
 * one commute read as eight listens — and because the verdict ("heard it
 * through", "stopped") belongs to the whole run, not to its last file.
 *
 * ## Three states, one URL
 *
 * `after` is a row cursor, `from`/`to` are dates, and both live in the query
 * string. The page is a Server Component that reads them, so the first paint is
 * the right one, Back returns to the previous page, and a filtered history can
 * be shared as a link. Nothing here is client state — the only client leaf on
 * this screen is a resume button inside a row.
 *
 * ## No sort control
 *
 * The act sorts by `startedAt: -1` and offers nothing else. A control that
 * reordered the current page would be a claim about the whole history that the
 * backend cannot keep, so "oldest" and "longest" are absent rather than
 * decorative.
 *
 * ## No delete
 *
 * There is no act for it and the phone owns removal. A disabled button would
 * promise a feature that does not exist.
 */
export default async function HistoryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;

  const after = afterParam(params.after);
  const range = parseHistoryRange(firstParam(params.from), firstParam(params.to));
  // Read once and passed down: every formatter on this page takes `now` as a
  // parameter, so two rows cannot disagree about what "today" is.
  const now = clock();

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <PageHeader
        overline="همهٔ نشست‌ها"
        title="تاریخ شنیدن"
        description="هر بار شنیدن، با زمان، مدت و نتیجه‌اش."
      />

      {/*
        Outside the Suspense: a failed read must not take the filter with it —
        the listener can still change the range to something that works.
      */}
      <HistoryRangeForm range={range} />

      <Suspense fallback={<HistorySkeleton rows={8} />}>
        <HistoryList after={after} range={range} now={now} />
      </Suspense>
    </div>
  );
}

/**
 * One page of stretches, isolated so the header and the filter paint first.
 *
 * The read is a single act call that reads as many batches as it needs to close
 * its last stretch (`actions/sessions/get-history-page.ts`), which on a slow
 * connection is the only part of this screen worth waiting on.
 */
async function HistoryList({
  after,
  range,
  now,
}: {
  after: number;
  range: HistoryRange;
  now: number;
}) {
  const result = await getHistoryPage({ after, from: range.from, to: range.to });
  const filtered = range.from !== undefined || range.to !== undefined;

  if (!result.success) {
    return (
      <Card>
        <ErrorState
          failure={result.error}
          // The same page, so navigating re-runs the Server Component and
          // re-issues the read — with the cursor and the range it had.
          retryHref={buildHistoryHref({ after, from: range.from, to: range.to })}
        />
      </Card>
    );
  }

  const { stretches, after: nextAfter, hasMore } = result.body;

  if (stretches.length === 0) {
    return (
      <Card>
        {filtered ? (
          // A range with nothing in it is not "no history": the listener may
          // have years of it, just not this week.
          <EmptyState
            icon="clock"
            title="در این بازه چیزی شنیده نشده"
            description="تاریخچه‌ای در این بازه نیست. بازه را کوتاه‌تر کنید یا پاک کنید."
            action={{ label: "پاک کردن بازه", href: "/history" }}
          />
        ) : after > 0 ? (
          // Reached by a hand-typed `after`, or by history shrinking between two
          // pages. Either way the cursor points past the end.
          <EmptyState
            icon="history"
            title="این صفحه خالی است"
            description="به نظر می‌رسد به انتهای تاریخچه رسیده‌اید."
            action={{ label: "بازگشت به ابتدای تاریخچه", href: "/history" }}
          />
        ) : (
          <EmptyState
            icon="history"
            title="هنوز چیزی نشنیده‌اید"
            description="با پخش یک ترک از کتابخانه یا کاوش، تاریخچه اینجا ساخته می‌شود."
            action={{ label: "کاوش مجموعه‌ها", href: "/browse" }}
          />
        )}
      </Card>
    );
  }

  return (
    <>
      <p className="type-caption text-text-tertiary">{describeHistorySummary(stretches)}</p>

      <HistorySections sections={buildHistorySections(stretches, now)} />

      <CursorPagination
        href={buildHistoryHref({ after: nextAfter, from: range.from, to: range.to })}
        hasMore={hasMore}
      />
    </>
  );
}
