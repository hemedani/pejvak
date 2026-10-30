import { Suspense } from "react";

import {
  getMyTracks,
  getSearchableTracks,
} from "@/app/actions/tracks/get-my-tracks";
import { LibrarySearch } from "@/components/domain/library-search";
import { TrackTable, type SortState } from "@/components/domain/track-table";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/state";
import type { TrackSummary } from "@/lib/domain/track";
import { SEARCH_LIMIT, type TrackSortField } from "@/lib/domain/track-query";
import { faNumber } from "@/lib/format";
import { createSearchIndex, foldQuery, searchIndex, type Range } from "@/lib/search";
import { pageParam, firstParam, type SearchParamValue } from "@/lib/search-params";
import { now as clock } from "@/lib/now";
import { trackSearchFields, TITLE_FIELD } from "@/lib/librarySearch";

export const metadata = { title: "کتابخانه" };

const PAGE_SIZE = 25;

const SORT_FIELDS: readonly TrackSortField[] = ["title", "lastPlayedAt", "createdAt", "updatedAt"];

type Search = {
  page?: SearchParamValue;
  sort?: SearchParamValue;
  order?: SearchParamValue;
  q?: SearchParamValue;
};

type HrefInput = { page?: number; sort?: TrackSortField; order?: "asc" | "desc"; q?: string };

/**
 * The library.
 *
 * ## Two modes, one URL
 *
 * Without `q` the list is **server-paginated and server-sorted**: `getMyTracks`
 * takes `page`, `limit`, `sortBy` and `sortOrder`, so the URL is the whole state
 * and the first paint is the right one.
 *
 * With `q` it is **folded on the server**: the act's own `search` is a Mongo
 * `$regex` over raw bytes, so `كتاب` misses `کتاب` (plan §2.3). Instead the page
 * loads the library once (`SEARCH_LIMIT` rows), folds it once, ranks by match
 * quality, and paginates the result in memory. Relevance ordering wins over the
 * requested sort in this mode — a search that is alphabetised has stopped being a
 * search.
 *
 * The cost is honest and bounded: a library larger than `SEARCH_LIMIT` is
 * searched only as far as the first 500 rows, and the note under the results says
 * so rather than quietly returning a wrong "no results".
 */
export default async function LibraryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;

  const query = (firstParam(params.q) ?? "").trim();
  const page = pageParam(params.page);
  const sortField = SORT_FIELDS.find((field) => field === firstParam(params.sort)) ?? "lastPlayedAt";
  const sortOrder = firstParam(params.order) === "asc" ? "asc" : "desc";
  const sort: SortState = { field: sortField, order: sortOrder };
  const now = clock();

  const hrefFor = (next: HrefInput): string => {
    const search = new URLSearchParams();
    const nextQuery = next.q ?? query;
    const nextSort = next.sort ?? sortField;
    const nextOrder = next.order ?? sortOrder;
    const nextPage = next.page ?? 1;

    if (nextQuery) search.set("q", nextQuery);
    if (nextSort !== "lastPlayedAt") search.set("sort", nextSort);
    if (nextOrder !== "desc") search.set("order", nextOrder);
    if (nextPage > 1) search.set("page", String(nextPage));

    const qs = search.toString();
    return qs ? `/library?${qs}` : "/library";
  };

  const buildSortHref = (field: TrackSortField): string => {
    // Clicking the active column flips it; clicking another starts at the order
    // that field is usually wanted in — names A→Z, dates newest first.
    if (field === sortField) {
      return hrefFor({ sort: field, order: sortOrder === "asc" ? "desc" : "asc" });
    }
    return hrefFor({ sort: field, order: field === "title" ? "asc" : "desc" });
  };

  const header = <LibraryHeader query={query} />;

  if (query.length > 0) {
    return (
      <div className="flex flex-col gap-[var(--space-lg)]">
        {header}
        <Suspense fallback={<TableSkeleton rows={6} />}>
          <SearchResults
            query={query}
            page={page}
            hrefFor={hrefFor}
            buildSortHref={buildSortHref}
            sort={sort}
            now={now}
          />
        </Suspense>
      </div>
    );
  }

  const result = await getMyTracks({ page, limit: PAGE_SIZE, sortBy: sortField, sortOrder });

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      {header}

      {!result.success ? (
        <Card>
          <ErrorState failure={result.error} retryHref="/library" />
        </Card>
      ) : result.body.tracks.length === 0 ? (
        <Card>
          <EmptyState
            icon="library"
            title={page > 1 ? "این صفحه خالی است" : "کتابخانه خالی است"}
            description={
              page > 1
                ? "به نظر می‌رسد به انتهای فهرست رسیده‌اید."
                : "ترک‌ها از اپلیکیشن موبایل همگام می‌شوند. تا آن زمان، مجموعه‌های آنلاین را کاوش کنید."
            }
            action={
              page > 1
                ? { label: "بازگشت به صفحهٔ اول", href: "/library" }
                : { label: "کاوش مجموعه‌ها", href: "/browse" }
            }
          />
        </Card>
      ) : (
        <>
          <TrackTable tracks={result.body.tracks} sort={sort} buildSortHref={buildSortHref} now={now} />
          <Pagination
            page={page}
            hasMore={result.body.hasMore}
            buildHref={(next) => hrefFor({ page: next })}
          />
        </>
      )}
    </div>
  );
}

/**
 * The folded search, isolated in its own async component.
 *
 * It reads the whole library, which is the slow path; wrapping it in `Suspense`
 * means the header and the search field paint immediately instead of waiting for
 * five hundred rows to arrive.
 */
async function SearchResults({
  query,
  page,
  hrefFor,
  buildSortHref,
  sort,
  now,
}: {
  query: string;
  page: number;
  hrefFor: (next: HrefInput) => string;
  buildSortHref: (field: TrackSortField) => string;
  sort: SortState;
  now: number;
}) {
  const library = await getSearchableTracks();

  if (!library.success) {
    return (
      <Card>
        <ErrorState failure={library.error} retryHref="/library" />
      </Card>
    );
  }

  const terms = foldQuery(query);
  const hits = searchIndex(createSearchIndex(library.body, trackSearchFields, TITLE_FIELD), terms);

  if (hits.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="search"
          title="چیزی پیدا نشد"
          description={`برای «${query}» موردی در کتابخانه نبود. املای دیگری را امتحان کنید؛ جست‌وجو نسبت به «ی/ي» و نیم‌فاصله حساس نیست.`}
        />
      </Card>
    );
  }

  const start = (page - 1) * PAGE_SIZE;
  const pageHits = hits.slice(start, start + PAGE_SIZE);

  const tracks: TrackSummary[] = pageHits.map((hit) => hit.item);
  const matches = new Map<string, readonly Range[]>();
  for (const hit of pageHits) {
    if (hit.ranges.length > 0) {
      matches.set(hit.item.id, hit.ranges);
    }
  }

  const capped = library.body.length >= SEARCH_LIMIT;

  return (
    <>
      <p className="type-caption text-text-tertiary">
        {faNumber(hits.length)} نتیجه
        {capped ? ` — جست‌وجو تنها در ${faNumber(SEARCH_LIMIT)} ترک نخست انجام شد` : ""}
      </p>

      <TrackTable
        tracks={tracks}
        sort={sort}
        buildSortHref={buildSortHref}
        now={now}
        matches={matches}
      />

      <Pagination
        page={page}
        hasMore={start + PAGE_SIZE < hits.length}
        buildHref={(next) => hrefFor({ page: next })}
      />
    </>
  );
}

function LibraryHeader({ query }: { query: string }) {
  return (
    <PageHeader
      overline="همهٔ ترک‌ها"
      title="کتابخانه"
      description="ترک‌های همگام‌شده از اپلیکیشن. فایل‌های محلی در وب پخش نمی‌شوند و فقط اطلاعاتشان نمایش داده می‌شود."
      actions={
        <div className="w-full min-w-[260px] sm:w-[340px]">
          <Suspense fallback={<div className="h-11" />}>
            <LibrarySearch initialQuery={query} />
          </Suspense>
        </div>
      }
    />
  );
}
