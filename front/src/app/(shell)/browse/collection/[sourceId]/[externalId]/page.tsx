import Link from "next/link";
import { notFound } from "next/navigation";

import { getMyContexts } from "@/app/actions/online/get-my-contexts";
import { getMyOnlineCollections } from "@/app/actions/online/get-my-online-collections";
import { getOnlineCollection } from "@/app/actions/online/get-online-collection";
import { OnlineArtwork } from "@/components/online/artwork";
import { FavoriteButton } from "@/components/online/favorite-button";
import { PlayCollectionButton } from "@/components/online/play-collection-button";
import { RemoveButton } from "@/components/online/remove-button";
import { SourceProblem } from "@/components/online/source-problem";
import { TrackList } from "@/components/online/track-list";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { EmptyState } from "@/components/ui/state";
import { fa } from "@/lib/format";
import {
  collectionKey,
  describeKnownTrackCount,
  findLanguage,
  findSource,
  isRtlText,
} from "@/lib/online";
import type { PlayableCollection } from "@/lib/online/play";
import { problemCodeFor } from "@/lib/online/problems";
import {
  describeRunOutcome,
  isPartialRun,
  runProgressRatio,
  runResumeTargetSec,
} from "@/lib/player/playbackContext";

type Params = { sourceId: string; externalId: string };

/**
 * One collection, opened.
 *
 * ## Two path segments, not one key
 *
 * The route is `[sourceId]/[externalId]` rather than a single `sourceId:externalId`
 * segment. A colon in a path segment is legal but awkward to share in a chat
 * window, and a static prefix routes more cheaply than a key that has to be
 * split before it can be matched.
 *
 * ## Three reads, one render
 *
 * The collection and its tracks (one action), the listener's saved row for this
 * source (which says whether the heart is filled and whether the remove control
 * belongs on the page at all), and this collection's newest run (which says where
 * to resume). They are independent, so they are asked for together.
 *
 * ## Nothing here writes
 *
 * A page view is not a decision. `lastOpenedAt` moves when the listener presses
 * play, the heart when they press it, the row when they remove it — all of them
 * Server Actions, all of them from a click. A render that mutated would make a
 * shared link change the recipient's shelf.
 *
 * ## A collection the source no longer has is a 404
 *
 * Not an error with a retry: the id in the URL is the thing that is wrong, and
 * offering "try again" for something that does not exist is a loop.
 */
export async function generateMetadata({ params }: { params: Promise<Params> }) {
  const { sourceId, externalId } = await params;
  const source = findSource(sourceId);
  if (!source) {
    return { title: "مجموعه" };
  }
  // The catalogue cache makes this a second read of an answer the page needs
  // anyway, not a second request to the source.
  const opened = await getOnlineCollection({ sourceId, externalId });
  return { title: opened.success ? opened.body.collection.title : source.nativeName };
}

export default async function CollectionPage({ params }: { params: Promise<Params> }) {
  const { sourceId, externalId } = await params;
  const source = findSource(sourceId);
  if (!source) {
    notFound();
  }

  const key = collectionKey(sourceId, externalId);

  const [opened, saved, runs] = await Promise.all([
    getOnlineCollection({ sourceId, externalId }),
    getMyOnlineCollections({ sourceId, limit: 100 }),
    getMyContexts({ contextType: "online", contextKey: key, limit: 1 }),
  ]);

  if (!opened.success) {
    const code = problemCodeFor(opened.error);
    if (code === "not_found") {
      notFound();
    }
    return (
      <div className="flex flex-col gap-[var(--space-lg)]">
        <PageBackLink sourceId={sourceId} label={source.nativeName} />
        <Card>
          <SourceProblem
            code={code}
            sourceName={source.nativeName}
            retryHref={`/browse/collection/${sourceId}/${externalId}`}
            detail={opened.error.message}
          />
        </Card>
      </div>
    );
  }

  const { collection, tracks } = opened.body;
  const languageName = findLanguage(collection.languageCode)?.nativeName ?? null;

  const savedRow = saved.success
    ? (saved.body.collections.find((row) => row.key === key) ?? null)
    : null;

  const lastRun = runs.success ? (runs.body[0] ?? null) : null;
  // A live station has no position to return to, so it is never "resumed" even
  // when a run exists — the broadcast has moved on without the listener.
  const resumeRun =
    lastRun !== null && !source.live && lastRun.endedAt !== null && isPartialRun(lastRun)
      ? lastRun
      : null;
  const startIndex = resumeRun
    ? Math.max(0, Math.min(resumeRun.lastIndex, Math.max(0, tracks.length - 1)))
    : 0;
  const startPositionSec = resumeRun ? runResumeTargetSec(resumeRun) : 0;
  const resumable = resumeRun !== null;

  const playLabel = source.live
    ? "پخش زنده"
    : resumable
      ? `ادامه از قطعهٔ ${fa(startIndex + 1)}`
      : lastRun
        ? "پخش دوباره"
        : "پخش";

  const playable: PlayableCollection = {
    key: collection.key,
    sourceId: collection.sourceId,
    externalId: collection.externalId,
    title: collection.title,
    artworkUrl: collection.artworkUrl,
    languageCode: collection.languageCode,
    trackCount: collection.trackCount,
    subtitle: collection.subtitle,
    pageUrl: collection.pageUrl,
  };

  const meta = [
    source.nativeName,
    languageName,
    describeKnownTrackCount(collection.trackCount),
  ].filter((part): part is string => typeof part === "string" && part.length > 0);

  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <PageBackLink sourceId={sourceId} label={source.nativeName} />

      <Card className="p-[var(--space-lg)]">
        <div className="flex flex-col gap-[var(--space-lg)] sm:flex-row">
          <OnlineArtwork
            artworkUrl={collection.artworkUrl}
            title={collection.title}
            paletteKey={collection.key}
            className="aspect-square w-full shrink-0 sm:w-[180px]"
          />

          <div className="min-w-0 flex-1">
            <p className="type-overline text-text-tertiary">{source.nativeName}</p>
            <h1
              className="type-title mt-[var(--space-xs)] text-text"
              dir={isRtlText(collection.title) ? "rtl" : "ltr"}
            >
              {collection.title}
            </h1>
            {collection.subtitle ? (
              <p className="type-body mt-[var(--space-xs)] text-text-secondary">
                {collection.subtitle}
              </p>
            ) : null}
            <p className="type-caption mt-[var(--space-sm)] text-text-tertiary">
              {meta.join(" · ")}
            </p>

            {lastRun && !source.live ? (
              <div className="mt-[var(--space-md)] max-w-[36ch]">
                <p className="type-caption text-text-secondary">{describeRunOutcome(lastRun).label}</p>
                <div
                  aria-hidden
                  className="mt-[var(--space-xs)] h-[var(--bar-thin)] w-full overflow-hidden rounded-[var(--radius-pill)] bg-[var(--track)]"
                >
                  <div
                    className="h-full rounded-[var(--radius-pill)] bg-accent"
                    style={{
                      width: `${Math.round(
                        runProgressRatio(lastRun.finishedCount, lastRun.trackCount) * 100,
                      )}%`,
                    }}
                  />
                </div>
              </div>
            ) : null}

            <div className="mt-[var(--space-lg)] flex flex-wrap items-start gap-[var(--space-sm)]">
              <PlayCollectionButton
                collection={playable}
                tracks={tracks}
                index={startIndex}
                startPositionSec={startPositionSec}
                label={playLabel}
                variant="primary"
                size="md"
              />

              {resumable ? (
                <PlayCollectionButton
                  collection={playable}
                  tracks={tracks}
                  index={0}
                  startPositionSec={0}
                  label="از ابتدا"
                  variant="secondary"
                  size="md"
                />
              ) : null}

              <FavoriteButton collection={playable} initialFavorite={savedRow?.isFavorite ?? false} />

              {savedRow ? <RemoveButton collection={playable} /> : null}

              {collection.pageUrl ? (
                <Button asChild variant="ghost" size="md">
                  <a href={collection.pageUrl} target="_blank" rel="noreferrer noopener">
                    <Icon name="external" size="sm" />
                    صفحهٔ منبع
                  </a>
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-[var(--space-md)] border-b border-outline-variant px-[var(--space-lg)] py-[var(--space-md)]">
          <h2 className="type-heading text-text">قطعه‌ها</h2>
          <span className="type-numeric text-text-tertiary">{fa(tracks.length)}</span>
        </div>

        {tracks.length === 0 ? (
          <EmptyState
            icon="empty"
            title="این مجموعه قطعه‌ای ندارد"
            description="منبع مجموعه را می‌شناسد، اما برایش فایلی برنگرداند."
            action={{ label: "بازگشت به منبع", href: `/browse/source/${source.id}` }}
          />
        ) : (
          <TrackList source={source} collection={playable} tracks={tracks} />
        )}
      </Card>
    </div>
  );
}

/** The way back up the tree: collection → source → language. */
function PageBackLink({ sourceId, label }: { sourceId: string; label: string }) {
  return (
    <Link
      href={`/browse/source/${sourceId}`}
      className="type-caption inline-flex w-fit items-center gap-[var(--space-xs)] text-text-secondary transition-colors hover:text-text"
    >
      <Icon name="start" size="sm" />
      {label}
    </Link>
  );
}
