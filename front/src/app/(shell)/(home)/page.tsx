import { getMyContexts } from "@/app/actions/online/get-my-contexts";
import { getMyOnlineCollections } from "@/app/actions/online/get-my-online-collections";
import { getSessionsInWindow } from "@/app/actions/sessions/get-sessions-in-window";
import { getMyStats } from "@/app/actions/stats/get-my-stats";
import { getMyTracks } from "@/app/actions/tracks/get-my-tracks";
import { ActivityChart, ActivitySummary } from "@/components/domain/activity-chart";
import { StatCell } from "@/components/domain/stat-cell";
import { ContinueSection } from "@/components/online/continue-section";
import { TopTracksTable } from "@/components/domain/top-tracks-table";
import { Reveal } from "@/components/motion/reveal";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, OfflineBanner } from "@/components/ui/state";
import { bucketByDay, currentStreak, joinTopTracks } from "@/lib/insights";
import { buildContinueItems } from "@/lib/online/continue";
import { formatNumber, formatSpan } from "@/lib/format";
import { now as clock } from "@/lib/now";
import { formatRelativeTime } from "@/lib/time";
import Link from "next/link";

const CHART_DAYS = 30;

/**
 * How many tracks the title join loads.
 *
 * The join needs names for ten hashes and there is no act that takes a hash, so
 * the choice is "a page big enough to contain them" or "no titles at all". Two
 * hundred, most recently played first, covers the ten loudest in any realistic
 * library — and a hash that falls outside it renders as an unnamed row rather
 * than disappearing (see `joinTopTracks`).
 */
const JOIN_LIMIT = 200;

/**
 * The dashboard.
 *
 * Three reads, issued in parallel — they are independent, and doing them in
 * sequence would make the slowest of the three the page's load time.
 *
 * Each has its own failure state. A dashboard that vanishes because the *chart*
 * could not load is the mistake this page exists to avoid: the totals are still
 * true, so they are still drawn, and the chart says why it is missing.
 *
 * The one exception is the totals. If `getMyStats` fails there is no page to
 * draw — every number on it comes from that act — so the page renders the error
 * and stops.
 */
export default async function DashboardPage() {
  const now = clock();
  const windowStart = now - CHART_DAYS * 24 * 60 * 60 * 1000;

  const [stats, library, sessions, runs, saved] = await Promise.all([
    getMyStats(),
    getMyTracks({ page: 1, limit: JOIN_LIMIT, sortBy: "lastPlayedAt", sortOrder: "desc" }),
    getSessionsInWindow({ from: windowStart }),
    // Continue is the only read whose failure does not remove anything else:
    // the totals and the chart are still true, so it is allowed to fail alone.
    getMyContexts({ contextType: "online", limit: 12 }),
    getMyOnlineCollections({ sortBy: "lastOpenedAt", limit: 36 }),
  ]);

  if (!stats.success) {
    return <ErrorState failure={stats.error} retryHref="/" />;
  }

  const data = stats.body;

  // The library call is also the title source for the top-tracks join (C4). If
  // it fails, the join degrades to `title: null` rather than blanking the table.
  const tracks = library.success ? library.body.tracks : [];
  const topRows = joinTopTracks(data.topTracks, tracks);

  const buckets = sessions.success ? bucketByDay(sessions.body, CHART_DAYS, now) : [];
  const streak = currentStreak(buckets);

  const hasHistory = data.sessionCount > 0;

  // One row, newest run per collection. The saved shelf only supplies artwork;
  // a run outlives the row it names, so it renders even when the shelf is gone.
  const continueItems = runs.success
    ? buildContinueItems(runs.body, saved.success ? saved.body.collections : [], 4)
    : [];

  /**
   * The denominator on "Tracks heard", or nothing.
   *
   * `tracks` is the *page* of the library loaded for the top-tracks join
   * (`JOIN_LIMIT`), not the library — so a library of 900 would have this card
   * say "of 200 in your library", which is a count derived from a page presented
   * as a total. It is only a total when the page did not hit the cap; when it
   * did, the card says what it can honestly say, or nothing at all if the read
   * failed.
   */
  const librarySize =
    library.success && library.body.tracks.length < JOIN_LIMIT
      ? `of ${formatNumber(library.body.tracks.length)} in your library`
      : library.success
        ? "of the tracks in your library"
        : undefined;

  /**
   * The four figures, in one place.
   *
   * An array rather than four literals in the JSX because the reveal is
   * index-driven: the order the cards are written in *is* the order they arrive
   * in, and a component that reads its index from a list cannot get that wrong
   * when a card is added.
   */
  const cells: { label: string; value: string; detail?: string; icon: IconName }[] = [
    {
      label: "Total listening time",
      value: formatSpan(data.totalListenTimeSec),
      detail:
        data.firstListenedAt === null
          ? undefined
          : `Since ${formatRelativeTime(data.firstListenedAt, now)}`,
      icon: "clock",
    },
    {
      label: "Sessions",
      value: formatNumber(data.sessionCount),
      detail: streak > 0 ? `${formatNumber(streak)}-day streak` : "Nothing today",
      icon: "stats",
    },
    {
      label: "Tracks heard",
      value: formatNumber(data.trackCount),
      detail: librarySize,
      icon: "player",
    },
    {
      label: "Last listen",
      value:
        data.lastListenedAt === null ? "—" : formatRelativeTime(data.lastListenedAt, now),
      detail: "Based on the end of your last session",
      icon: "history",
    },
  ];

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Listening console"
        title="Home"
        description={
          data.lastListenedAt === null
            ? "Nothing recorded yet."
            : `Last listen: ${formatRelativeTime(data.lastListenedAt, now)}`
        }
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/library">
              <Icon name="library" size="sm" />
              Library
            </Link>
          </Button>
        }
      />

      {sessions.success ? null : sessions.error.kind === "offline" ? (
        <OfflineBanner />
      ) : null}

      {!hasHistory ? (
        <Card>
          <EmptyState
            icon="play"
            title="You haven't listened to anything yet"
            description="Playing an online collection builds your history and stats here. Files on your phone cannot be played on the web."
            action={{ label: "Browse collections", href: "/browse" }}
          />
        </Card>
      ) : (
        <>
          {/*
            "What was I doing" before "what have I done". It is the first thing
            a returning listener wants, and it is the same shelf Browse draws.
          */}
          <Reveal index={0}>
            <ContinueSection
              items={continueItems}
              failure={runs.success ? undefined : runs.error}
            />
          </Reveal>

          {/*
            Four numbers, arriving one after the other. The stagger is the only
            motion on this page: it says "this was assembled for you" without a
            single element moving after it lands.
          */}
          <div className="grid gap-[var(--space-md)] sm:grid-cols-2 xl:grid-cols-4">
            {cells.map((cell, index) => (
              <Reveal key={cell.label} index={index + 1} className="h-full">
                <StatCell
                  label={cell.label}
                  value={cell.value}
                  detail={cell.detail}
                  icon={cell.icon}
                  className="h-full"
                />
              </Reveal>
            ))}
          </div>

          <Reveal index={cells.length + 1}>
            <Card className="p-[var(--space-xl)]">
              <CardHeading overline="Last 30 days" title="Listening activity" />
              <div className="mt-[var(--space-lg)]">
                {sessions.success ? (
                  <>
                    <ActivityChart buckets={buckets} />
                    <div className="mt-[var(--space-sm)]">
                      <ActivitySummary buckets={buckets} />
                    </div>
                  </>
                ) : (
                  <ErrorState failure={sessions.error} retryHref="/" className="px-0 py-[var(--space-lg)]" />
                )}
              </div>
            </Card>
          </Reveal>

          <Reveal index={cells.length + 2}>
            <section className="flex flex-col gap-[var(--space-md)]">
              <CardHeading overline="Most time" title="Top ten tracks" />

              {topRows.length === 0 ? (
                <Card>
                  <EmptyState
                    icon="stats"
                    title="No stats to show"
                    description="After a few listening sessions, your most-played tracks appear here."
                  />
                </Card>
              ) : (
                <TopTracksTable rows={topRows} now={now} />
              )}
            </section>
          </Reveal>
        </>
      )}
    </div>
  );
}
