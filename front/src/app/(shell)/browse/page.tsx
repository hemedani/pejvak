import { Suspense } from "react";

import { getMyContexts } from "@/app/actions/online/get-my-contexts";
import { getMyOnlineCollections } from "@/app/actions/online/get-my-online-collections";
import { BrowseTabs, type BrowseTab } from "@/components/online/browse-tabs";
import { CollectionGridSkeleton } from "@/components/online/collection-grid";
import { ContinueShelf } from "@/components/online/continue-shelf";
import { FavoriteShelf } from "@/components/online/favorite-shelf";
import { LanguageListSkeleton } from "@/components/online/language-list";
import { LanguageSearch } from "@/components/online/language-search";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { buildContinueItems } from "@/lib/online/continue";
import { LANGUAGES } from "@/lib/online/languages";
import { firstParam, type SearchParamValue } from "@/lib/search-params";

export const metadata = { title: "کاوش" };

type Search = { tab?: SearchParamValue };

const TABS: readonly BrowseTab[] = ["continue", "favorites", "browse"];

/**
 * The shelf of free audio.
 *
 * ## Three tabs, one URL
 *
 * The tab is `?tab=`, and each tab is a link — not a client-side switch. A shelf
 * is a place: the back button walks through it, a link to Favorites can be sent
 * to someone, and the server renders the right shelf on the first paint instead
 * of swapping it in after hydration.
 *
 * ## The landing makes no third-party request
 *
 * `tab=browse` renders the language catalogue, which is a static table compiled
 * into the bundle. Continue and Favorites read only the backend. **No adapter
 * runs until a source's page is opened**, so opening `/browse` costs this app's
 * own server and nothing else — no source learns that the listener looked, and a
 * slow archive cannot delay the page.
 *
 * ## The header and tabs never wait
 *
 * Each panel has a skeleton of its own shape, and the boundary is around the
 * panel rather than around the page: a page-level fallback would take the
 * navigation away with it while a source answered.
 */
export default async function BrowsePage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const requested = firstParam(params.tab);
  const tab: BrowseTab = TABS.find((entry) => entry === requested) ?? "browse";

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <PageHeader
        overline="کتابخانهٔ آزاد"
        title="کاوش"
        description="صداهای رایگان از منبع‌های خودشان، برای شنیدن در همین مرورگر."
      />

      <BrowseTabs active={tab} />

      <Suspense
        key={tab}
        fallback={tab === "browse" ? <LanguageListSkeleton /> : <CollectionGridSkeleton />}
      >
        {tab === "continue" ? (
          <ContinuePanel />
        ) : tab === "favorites" ? (
          <FavoritesPanel />
        ) : (
          <LanguageSearch languages={LANGUAGES} />
        )}
      </Suspense>
    </div>
  );
}

/**
 * Two reads, one render.
 *
 * The runs say *where* the listener is; the shelf says what to draw around that
 * position. They are asked for in parallel because neither depends on the other,
 * and a failed shelf read is not a failed Continue: a run alone can still draw a
 * card, just without artwork.
 */
async function ContinuePanel() {
  const [runs, saved] = await Promise.all([
    getMyContexts({ contextType: "online", limit: 36 }),
    getMyOnlineCollections({ sortBy: "lastOpenedAt", limit: 100 }),
  ]);

  if (!runs.success) {
    return (
      <Card>
        <ErrorState failure={runs.error} retryHref="/browse?tab=continue" />
      </Card>
    );
  }

  const items = buildContinueItems(runs.body, saved.success ? saved.body.collections : [], 12);

  if (items.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="history"
          title="چیزی برای ادامه نیست"
          description="هر مجموعه‌ای را که نیمه‌کاره رها کنید، اینجا منتظر شما می‌ماند."
          action={{ label: "کاوش مجموعه‌ها", href: "/browse?tab=browse" }}
        />
      </Card>
    );
  }

  return <ContinueShelf items={items} />;
}

async function FavoritesPanel() {
  const result = await getMyOnlineCollections({ isFavorite: true, sortBy: "updatedAt", limit: 24 });

  if (!result.success) {
    return (
      <Card>
        <ErrorState failure={result.error} retryHref="/browse?tab=favorites" />
      </Card>
    );
  }

  if (result.body.collections.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="favorite"
          title="هنوز مجموعه‌ای نشان نکرده‌اید"
          description="قلب روی هر مجموعه‌ای آن را به این فهرست می‌آورد."
          action={{ label: "کاوش مجموعه‌ها", href: "/browse?tab=browse" }}
        />
      </Card>
    );
  }

  return <FavoriteShelf collections={result.body.collections} />;
}
