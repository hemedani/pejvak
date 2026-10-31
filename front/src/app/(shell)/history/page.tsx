import { Suspense } from "react";

import { getHistoryPage } from "@/app/actions/sessions/get-history-page";
import { getMySettings } from "@/app/actions/settings/get-my-settings";
import { HistoryRangeForm } from "@/components/domain/history-range-form";
import { HistorySections, HistorySkeleton } from "@/components/domain/history-sections";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { CursorPagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/state";
import {
  buildHistoryHref,
  buildHistorySections,
  describeHistoryOrder,
  describeHistorySummary,
  parseHistoryRange,
  type HistoryRange,
} from "@/lib/history";
import { now as clock } from "@/lib/now";
import { afterParam, firstParam, type SearchParamValue } from "@/lib/search-params";

export const metadata = { title: "History" };

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
 * ## Order is a preference, applied to the page
 *
 * `getMyListeningHistory` sorts by `startedAt: -1` and takes no sort parameter,
 * so the order comes from the listener's shared settings and is applied **here**,
 * to the page that was read — the same thing the phone does, and the same thing
 * `describeHistoryOrder` says in a caption when the order is not the default. A
 * server-side sort would be a claim about the whole history that the act cannot
 * keep; this one is a claim about fifty rows, which it can.
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
        overline="Every session"
        title="History"
        description="Every listen, with its time, length and outcome."
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
  /*
    Two acts in parallel: the page, and the order it should be drawn in. Neither
    depends on the other, and the settings read is a preference — if it fails the
    list still renders, newest first, which is what the act returns anyway. A
    failed preference must never turn a working screen into an error state.
  */
  const [result, preferences] = await Promise.all([
    getHistoryPage({ after, from: range.from, to: range.to }),
    getMySettings(),
  ]);

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
  const sort = preferences.success ? preferences.body.historySort : "newest";

  if (stretches.length === 0) {
    return (
      <Card>
        {filtered ? (
          // A range with nothing in it is not "no history": the listener may
          // have years of it, just not this week.
          <EmptyState
            icon="clock"
            title="Nothing heard in this range"
            description="There is no history in this range. Narrow it or clear it."
            action={{ label: "Clear range", href: "/history" }}
          />
        ) : after > 0 ? (
          // Reached by a hand-typed `after`, or by history shrinking between two
          // pages. Either way the cursor points past the end.
          <EmptyState
            icon="history"
            title="This page is empty"
            description="You appear to have reached the end of the history."
            action={{ label: "Back to the start of the history", href: "/history" }}
          />
        ) : (
          <EmptyState
            icon="history"
            title="You haven't listened to anything yet"
            description="Play a track from your library or from Browse and the history is built here."
            action={{ label: "Browse collections", href: "/browse" }}
          />
        )}
      </Card>
    );
  }

  const orderNote = describeHistoryOrder(sort);

  return (
    <>
      <div className="flex flex-col gap-[var(--space-xs)]">
        <p className="type-caption text-text-tertiary">{describeHistorySummary(stretches)}</p>
        {/*
          The qualifier, on its own line under the figure it qualifies. Both are
          captions, so they read as one block; running them together on one line
          would bury the "this page only" half of the sentence at the end of a
          longer one.
        */}
        {orderNote ? <p className="type-caption text-text-tertiary">{orderNote}</p> : null}
      </div>

      <HistorySections sections={buildHistorySections(stretches, now, sort)} />

      <CursorPagination
        href={buildHistoryHref({ after: nextAfter, from: range.from, to: range.to })}
        hasMore={hasMore}
      />
    </>
  );
}
