import { cache } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { getTrackSessions } from "@/app/actions/sessions/get-track-sessions";
import { getTrackDetail } from "@/app/actions/tracks/get-track-detail";
import { AnnotationPanel } from "@/components/domain/annotation-list";
import { PlayTrackButton } from "@/components/player/play-track-button";
import { SessionList, SessionListSummary } from "@/components/domain/session-list";
import { StatCell } from "@/components/domain/stat-cell";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeading } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { Pagination } from "@/components/ui/pagination";
import { EmptyState, ErrorState } from "@/components/ui/state";
import { isPlayableOnWeb, type TrackDetail } from "@/lib/domain/track";
import { formatBytes, formatNumber, formatSpan } from "@/lib/format";
import { pageParam, type SearchParamValue } from "@/lib/search-params";
import { now as clock } from "@/lib/now";
import { formatClock, formatDate, formatRelativeTime } from "@/lib/time";

/**
 * One track: what it is, what has been heard of it, and what was written on it.
 *
 * ## Two reads, in parallel
 *
 * `getTrackDetail` for the track and its notes; `getTrackSessions` for the
 * timeline. They are independent, so they are issued together — doing them in
 * sequence would make the page as slow as their sum.
 *
 * The notes ride along with the track because there is no act that returns one
 * track's notes (`getMyAnnotations` has no `trackId` filter), and the embedded
 * relation is bounded at 1000 and sorted by position (`models/annotation.ts`).
 * The sessions do **not** ride along, even though that relation exists too: it
 * is sorted by `_id`, which is sync order rather than listening order, and a
 * timeline has to be in listening order. See `actions/sessions/get-track-sessions.ts`.
 *
 * ## A missing track is a 404, not an error
 *
 * The act is scoped to the signed-in user, so it answers `null` for an id that
 * does not exist and for one that belongs to somebody else. Neither is a
 * failure to report — both are "nothing here".
 */

type RouteParams = { trackId: string };
type RouteSearch = { sessions?: SearchParamValue };

/**
 * `generateMetadata` and the page both need the track, and a Server Action is
 * not cached between them. `cache` memoises the call for the duration of one
 * request, so the header and the tab title come from a single round trip.
 */
const loadTrack = cache(getTrackDetail);

export async function generateMetadata({ params }: { params: Promise<RouteParams> }): Promise<Metadata> {
  const { trackId } = await params;
  const result = await loadTrack(trackId);

  // A failed or missing read keeps the generic title: the page itself renders
  // the reason, and a tab that says "error" is not more informative.
  return { title: result.success && result.body ? result.body.title : "Track" };
}

export default async function TrackPage({
  params,
  searchParams,
}: {
  params: Promise<RouteParams>;
  searchParams: Promise<RouteSearch>;
}) {
  const { trackId } = await params;
  const search = await searchParams;
  const sessionPage = pageParam(search.sessions);
  const now = clock();

  const [detail, sessions] = await Promise.all([
    loadTrack(trackId),
    getTrackSessions(trackId, sessionPage),
  ]);

  if (!detail.success) {
    return <ErrorState failure={detail.error} retryHref={`/library/${trackId}`} />;
  }

  if (detail.body === null) {
    notFound();
  }

  const track = detail.body;
  const subtitle = [track.author, track.narrator].filter(Boolean).join(" · ");

  const hrefForPage = (page: number): string =>
    page > 1 ? `/library/${trackId}?sessions=${page}` : `/library/${trackId}`;

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <Link
        href="/library"
        className="type-caption inline-flex w-fit items-center gap-[var(--space-xs)] text-text-tertiary transition-colors hover:text-text"
      >
        <Icon name="start" size="xs" />
        Library
      </Link>

      <Card className="p-[var(--space-lg)]">
        <div className="flex flex-col gap-[var(--space-lg)] sm:flex-row sm:items-start">
          <Artwork track={track} />

          <div className="min-w-0 flex-1">
            <p className="type-overline mb-[var(--space-xs)] text-text-tertiary">
              {track.isAudiobook ? "Audiobook" : "Track"}
            </p>

            <h1 className="type-title text-text">{track.title}</h1>

            {subtitle ? (
              <p className="type-body mt-[var(--space-xs)] text-text-secondary">{subtitle}</p>
            ) : null}

            <div className="mt-[var(--space-sm)] flex flex-wrap items-center gap-[var(--space-xs)]">
              {track.origin === "local" ? (
                <Badge tone="muted">Local</Badge>
              ) : (
                <Badge tone="accent">Online</Badge>
              )}

              {track.collectionTitle ? <Badge tone="neutral">{track.collectionTitle}</Badge> : null}

              <Badge tone="neutral">
                <span className="type-numeric">{formatClock(track.durationSec)}</span>
              </Badge>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-[var(--space-md)] sm:grid-cols-2 xl:grid-cols-4">
        <StatCell
          label="Listening time"
          value={formatSpan(track.totalListenTimeSec)}
          detail={track.totalPlayCount === 0 ? "Never played" : undefined}
          icon="clock"
        />
        <StatCell
          label="Play count"
          value={formatNumber(track.totalPlayCount)}
          icon="stats"
        />
        <StatCell
          label="Last played"
          value={track.lastPlayedAt === null ? "—" : formatRelativeTime(track.lastPlayedAt, now)}
          detail={track.lastPlayedAt === null ? "Not in history" : formatDate(track.lastPlayedAt)}
          icon="history"
        />
        <StatCell
          label="Notes"
          value={formatNumber(track.annotations.length)}
          detail={
            track.annotations.length === 0
              ? "No notes yet"
              : // The relation arrives sorted by position, so the first row is
                // the earliest marker. Naming it is a fact about the list, not a
                // count derived from it.
                `First marker at ${formatClock(track.annotations[0]?.positionSec ?? 0)}`
          }
          icon="note"
        />
      </div>

      <PlaybackNote track={track} />

      <section className="flex flex-col gap-[var(--space-md)]">
        <CardHeading overline="History" title="Listening sessions" />

        {!sessions.success ? (
          <Card>
            <ErrorState
              failure={sessions.error}
              retryHref={hrefForPage(sessionPage)}
              className="py-[var(--space-xl)]"
            />
          </Card>
        ) : sessions.body.sessions.length === 0 ? (
          <Card>
            <EmptyState
              icon="history"
              title={sessionPage > 1 ? "This page is empty" : "This track has not been heard yet"}
              description={
                sessionPage > 1
                  ? "You appear to have reached the end of the history."
                  : "Sessions sync from the mobile app; every listen is listed here with its time and span."
              }
              action={
                sessionPage > 1
                  ? { label: "Back to the first page", href: `/library/${trackId}` }
                  : undefined
              }
            />
          </Card>
        ) : (
          <>
            <Card className="p-[var(--space-lg)]">
              <SessionList sessions={sessions.body.sessions} />
            </Card>

            <SessionListSummary sessions={sessions.body.sessions} page={sessions.body.page} />

            <Pagination
              page={sessions.body.page}
              hasMore={sessions.body.hasMore}
              buildHref={hrefForPage}
            />
          </>
        )}
      </section>

      <section className="flex flex-col gap-[var(--space-md)]">
        <CardHeading
          overline="Notes"
          title={track.annotations.length > 0 ? `${formatNumber(track.annotations.length)} notes` : "Note"}
        />

        <Card className="p-[var(--space-lg)]">
          <AnnotationPanel annotations={track.annotations} durationSec={track.durationSec} />
        </Card>
      </section>

      <FileFacts track={track} />
    </div>
  );
}

/**
 * Whether this track can be heard in a browser (plan §1.2, §9.6).
 *
 * Not a disabled play button: there is no player yet, and a greyed-out control
 * would suggest the listener could unlock it. The two cases are stated as facts
 * about where the audio is, because that is what they are — a local file is not
 * a failure of the web app, it is a file the server has never seen.
 */
function PlaybackNote({ track }: { track: TrackDetail }) {
  const playable = isPlayableOnWeb(track);

  return (
    <Card className="p-[var(--space-lg)]">
      <div className="flex items-start gap-[var(--space-md)]">
        <span
          aria-hidden
          className="grid size-10 shrink-0 place-items-center rounded-[var(--radius-sm)] bg-surface-sunken text-text-tertiary"
        >
          <Icon name={playable ? "play" : "player"} size="md" />
        </span>

        <div className="min-w-0">
          <p className="type-body-strong text-text">
            {playable ? "Playable in the browser" : "The audio is on your device"}
          </p>
          <p className="type-caption mt-[var(--space-xs)] max-w-[62ch] text-text-tertiary">
            {playable
              ? "This track comes from an online source, so it has an audio address and plays in the browser."
              : "This track's audio file is stored on your phone and the server keeps no address for it, so it cannot be played on the web. Its details and history are complete."}
          </p>
          <PlayTrackButton track={track} />
        </div>
      </div>
    </Card>
  );
}

/**
 * The file the phone uploaded.
 *
 * Optional rows are omitted rather than rendered as em dashes — a row of "—"
 * says "we looked and found nothing", which is noise on a page whose subject is
 * already known. The content hash is the exception and always appears: it is the
 * track's true identity (two files with one hash are one recording), and it is
 * the only field here that a support question ever needs.
 */
function FileFacts({ track }: { track: TrackDetail }) {
  const rows: { label: string; value: React.ReactNode }[] = [];

  if (track.fileName) {
    rows.push({
      label: "File name",
      value: (
        <span dir="ltr" className="break-all">
          {track.fileName}
        </span>
      ),
    });
  }
  if (track.fileSizeBytes > 0) {
    rows.push({
      label: "Size",
      value: <span className="type-numeric">{formatBytes(track.fileSizeBytes)}</span>,
    });
  }
  if (track.mimeType) {
    rows.push({
      label: "Format",
      value: <span dir="ltr">{track.mimeType}</span>,
    });
  }
  if (track.createdAt !== null) {
    rows.push({ label: "Added to library", value: formatDate(track.createdAt) });
  }
  if (track.downloadedAt !== null) {
    rows.push({ label: "Downloaded to device", value: formatDate(track.downloadedAt) });
  }
  rows.push({
    label: "Content ID",
    value: (
      <span dir="ltr" className="break-all text-text-tertiary">
        {track.contentHash}
      </span>
    ),
  });

  return (
    <section className="flex flex-col gap-[var(--space-md)]">
      <CardHeading overline="File" title="About this file" />

      <Card className="p-[var(--space-lg)]">
        <dl className="grid gap-x-[var(--space-lg)] gap-y-[var(--space-sm)] sm:grid-cols-[max-content_1fr]">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="type-caption text-text-tertiary">{row.label}</dt>
              <dd className="type-caption min-w-0 text-text-secondary">{row.value}</dd>
            </div>
          ))}
        </dl>
      </Card>
    </section>
  );
}

/**
 * The artwork, at header size.
 *
 * A remote URL from an arbitrary host: `next/image` needs every source
 * allow-listed at build time, and a broken image must not break the page. Same
 * reasoning as the row artwork in `track-table.tsx`, which is why both use a
 * plain `<img>` with a fixed box.
 */
function Artwork({ track }: { track: TrackDetail }) {
  if (track.artworkUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={track.artworkUrl}
        alt=""
        width={96}
        height={96}
        className="size-24 shrink-0 rounded-[var(--radius-md)] object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-24 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunken text-text-tertiary"
    >
      <Icon name={track.isAudiobook ? "book" : "player"} size="xl" />
    </span>
  );
}
