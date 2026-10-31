import { Suspense } from "react";

import { getMyPlaylists } from "@/app/actions/playlists/get-my-playlists";
import { PlaylistCard } from "@/components/domain/playlist-card";
import { PlaylistCreateForm } from "@/components/domain/playlist-create-form";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/state";
import { PLAYLIST_PAGE_SIZE } from "@/lib/domain/playlist-query";
import { now as clock } from "@/lib/now";
import { pageParam, type SearchParamValue } from "@/lib/search-params";

export const metadata = { title: "فهرست‌ها" };

type Search = { page?: SearchParamValue };

/**
 * The listener's playlists.
 *
 * ## Newest change first, and that is the whole ordering
 *
 * `getMyPlaylists` sorts by `updatedAt` descending, so reordering a playlist
 * moves it to the top. That is the act's contract and the useful order for a
 * screen whose job is "pick one up again" — a client-side sort to "stabilise"
 * it would show a different order on every page.
 *
 * ## The create form is outside the Suspense
 *
 * It is the action this page exists for, and it must be usable while the list is
 * still arriving. It also stays visible in the empty state: an empty state with
 * its own "create" button would be a second control pointing at a form that is
 * already above it.
 *
 * ## No sort control, no filters
 *
 * The act offers neither, and a control that only reordered the current page
 * would be a claim about the whole list that the backend cannot keep.
 */
export default async function PlaylistsPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);
  // Read once and passed down, so every card's "last changed" agrees.
  const now = clock();

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <PageHeader
        overline="مجموعه‌های شما"
        title="فهرست‌ها"
        description="ترکیب دلخواهی از ترک‌ها، با ترتیب قابل تغییر."
      />

      <PlaylistCreateForm />

      <Suspense
        fallback={
          <Card className="p-[var(--space-lg)]">
            <TableSkeleton rows={5} />
          </Card>
        }
      >
        <PlaylistList page={page} now={now} />
      </Suspense>
    </div>
  );
}

async function PlaylistList({ page, now }: { page: number; now: number }) {
  const result = await getMyPlaylists({ page, limit: PLAYLIST_PAGE_SIZE });

  const hrefForPage = (next: number): string =>
    next > 1 ? `/playlists?page=${next}` : "/playlists";

  if (!result.success) {
    return (
      <Card>
        <ErrorState failure={result.error} retryHref={hrefForPage(page)} />
      </Card>
    );
  }

  const { playlists, hasMore } = result.body;

  if (playlists.length === 0) {
    return (
      <Card>
        {page > 1 ? (
          // A cursor past the end is not "you have no playlists": the listener
          // may have several, just not on this page.
          <EmptyState
            icon="playlist"
            title="این صفحه خالی است"
            description="به نظر می‌رسد به انتهای فهرست رسیده‌اید."
            action={{ label: "بازگشت به صفحهٔ اول", href: "/playlists" }}
          />
        ) : (
          <EmptyState
            icon="playlist"
            title="هنوز فهرستی نساخته‌اید"
            description="ترک‌ها را در یک فهرست جمع کنید تا پشت‌سرهم بشنوید."
          />
        )}
      </Card>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-[var(--space-md)]">
        {playlists.map((playlist) => (
          <li key={playlist.id}>
            <PlaylistCard playlist={playlist} now={now} />
          </li>
        ))}
      </ul>

      {/*
        Only when there is somewhere to go. `Pagination` draws its disabled ends
        rather than removing them — right for a table whose height must not jump,
        wrong here: a single page of three cards does not need a control row.
        Once paging is meaningful the row is stable, because every page after the
        first keeps it.
      */}
      {page > 1 || hasMore ? (
        <Pagination page={page} hasMore={hasMore} buildHref={hrefForPage} />
      ) : null}
    </>
  );
}
