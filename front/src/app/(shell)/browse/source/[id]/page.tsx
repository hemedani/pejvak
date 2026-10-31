import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getBrowseCollections } from "@/app/actions/online/get-browse-collections";
import { CollectionCard } from "@/components/online/collection-card";
import { CollectionGrid, CollectionGridSkeleton } from "@/components/online/collection-grid";
import { SourceProblem } from "@/components/online/source-problem";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState } from "@/components/ui/state";
import { findLanguage, findSource, sourceLanguages, type OnlineSource } from "@/lib/online";
import { problemCodeFor } from "@/lib/online/problems";
import { firstParam, pageParam, type SearchParamValue } from "@/lib/search-params";

type Search = {
  page?: SearchParamValue;
  q?: SearchParamValue;
  language?: SearchParamValue;
};

const PAGE_SIZE = 24;

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const source = findSource(id);
  return { title: source ? source.nativeName : "منبع" };
}

/**
 * One source's shelf.
 *
 * ## The language is carried, not assumed
 *
 * A provider may serve several languages (LibriVox and Radio Browser do), so the
 * language the listener arrived with travels in `?language=` and is validated
 * against the source's own list. An unknown or unserved value falls back to the
 * source's primary language rather than being passed to an adapter that would
 * ignore it and return the wrong shelf.
 *
 * ## Search is a form, not a field with a timer
 *
 * `method="get"` means the query lands in the URL, works without JavaScript, and
 * can be shared. The hidden `language` input is what keeps a search inside the
 * language the listener chose — a plain GET replaces the whole query string.
 *
 * ## The grid is the only thing that waits
 *
 * The header is source metadata (compiled in), so it paints immediately and the
 * catalogue streams in under it. A source that is down shows a source-shaped
 * error with a retry, never a blank grid and never a thrown error.
 */
export default async function SourcePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Search>;
}) {
  const { id } = await params;
  const source = findSource(id);
  if (!source) {
    notFound();
  }

  const query = await searchParams;
  const page = pageParam(query.page);
  const search = (firstParam(query.q) ?? "").trim();
  const requested = firstParam(query.language);
  const language =
    requested && sourceLanguages(source).includes(requested) ? requested : source.languageCode;
  const languageName = findLanguage(language)?.nativeName ?? language;

  const hrefFor = (nextPage: number): string => {
    const next = new URLSearchParams();
    if (search) next.set("q", search);
    if (language !== source.languageCode) next.set("language", language);
    if (nextPage > 1) next.set("page", String(nextPage));
    const qs = next.toString();
    return qs ? `/browse/source/${source.id}?${qs}` : `/browse/source/${source.id}`;
  };

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <Link
        href={`/browse/language/${language}`}
        className="type-caption inline-flex w-fit items-center gap-[var(--space-xs)] text-text-secondary transition-colors hover:text-text"
      >
        <Icon name="start" size="sm" />
        {languageName}
      </Link>

      <PageHeader
        overline={source.nativeName}
        title={source.name}
        description={source.description}
        actions={
          <Button asChild variant="ghost" size="sm">
            <a href={source.homepage} target="_blank" rel="noreferrer noopener">
              <Icon name="external" size="sm" />
              صفحهٔ منبع
            </a>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-[var(--space-xs)]">
        <Badge tone="neutral" size="md">
          {languageName}
        </Badge>
        {source.live ? (
          <Badge tone="accent" size="md">
            زنده
          </Badge>
        ) : null}
        {source.attribution ? (
          <p className="type-caption text-text-tertiary">{source.attribution}</p>
        ) : null}
      </div>

      <form method="get" action={`/browse/source/${source.id}`} className="flex items-center gap-[var(--space-sm)]">
        {language !== source.languageCode ? (
          <input type="hidden" name="language" value={language} />
        ) : null}
        <div className="relative min-w-0 flex-1">
          <span className="pointer-events-none absolute inset-y-0 start-[var(--space-md)] grid place-items-center text-text-tertiary">
            <Icon name="search" size="sm" />
          </span>
          <input
            type="search"
            name="q"
            defaultValue={search}
            placeholder="جست‌وجو در این منبع…"
            aria-label={`جست‌وجو در ${source.nativeName}`}
            className="h-11 w-full rounded-[var(--radius-pill)] border border-outline-strong bg-surface-sunken pe-[var(--space-lg)] ps-10 type-body text-text placeholder:text-text-tertiary focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
          />
        </div>
        <Button type="submit" variant="secondary" size="md">
          جست‌وجو
        </Button>
      </form>

      <Suspense key={`${page}:${search}:${language}`} fallback={<CollectionGridSkeleton />}>
        <CollectionPanel
          source={source}
          language={language}
          page={page}
          search={search}
          hrefFor={hrefFor}
        />
      </Suspense>
    </div>
  );
}

async function CollectionPanel({
  source,
  language,
  page,
  search,
  hrefFor,
}: {
  source: OnlineSource;
  language: string;
  page: number;
  search: string;
  hrefFor: (page: number) => string;
}) {
  const result = await getBrowseCollections({
    sourceId: source.id,
    languageCode: language,
    page,
    query: search,
    limit: PAGE_SIZE,
  });

  if (!result.success) {
    return (
      <Card>
        <SourceProblem
          code={problemCodeFor(result.error)}
          sourceName={source.nativeName}
          retryHref={hrefFor(page)}
          detail={result.error.message}
        />
      </Card>
    );
  }

  const { collections, hasMore } = result.body;

  // Built rather than derived from `hrefFor` by stripping the query: the query is
  // arbitrary user text, and a regex over it would eventually eat the wrong half.
  const clearSearchHref = (() => {
    const next = new URLSearchParams();
    if (language !== source.languageCode) next.set("language", language);
    const qs = next.toString();
    return qs ? `/browse/source/${source.id}?${qs}` : `/browse/source/${source.id}`;
  })();

  if (collections.length === 0) {
    if (search) {
      return (
        <Card>
          <EmptyState
            icon="search"
            title="چیزی پیدا نشد"
            description={`«${search}» در این منبع نتیجه‌ای نداشت.`}
            action={{ label: "پاک کردن جست‌وجو", href: clearSearchHref }}
          />
        </Card>
      );
    }

    // A page number past the end is reachable by a shared link. It is not an
    // error, and the way out is page one rather than a retry that cannot help.
    if (page > 1) {
      return (
        <Card>
          <EmptyState
            icon="empty"
            title="این صفحه خالی است"
            description="این منبع در این صفحه مجموعهٔ دیگری ندارد."
            action={{ label: "بازگشت به صفحهٔ اول", href: hrefFor(1) }}
          />
        </Card>
      );
    }

    return (
      <Card>
        <EmptyState
          icon="browse"
          title="این منبع فعلاً مجموعه‌ای ندارد"
          description="منبع پاسخ داد، اما فهرستش برای این زبان خالی است."
          action={{ label: "منبع دیگر", href: `/browse/language/${language}` }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <CollectionGrid>
        {collections.map((collection) => (
          <CollectionCard
            key={collection.key}
            collection={collection}
            href={`/browse/collection/${encodeURIComponent(collection.sourceId)}/${encodeURIComponent(collection.externalId)}`}
          />
        ))}
      </CollectionGrid>

      {hasMore || page > 1 ? (
        <Pagination page={page} hasMore={hasMore} buildHref={hrefFor} className="px-[var(--space-xs)]" />
      ) : null}
    </div>
  );
}
