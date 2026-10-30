import { getSessionsInWindow } from "@/app/actions/sessions/get-sessions-in-window";
import { getMyStats } from "@/app/actions/stats/get-my-stats";
import { getMyTracks } from "@/app/actions/tracks/get-my-tracks";
import { ActivityChart, ActivitySummary } from "@/components/domain/activity-chart";
import { StatCell } from "@/components/domain/stat-cell";
import { TopTracksTable } from "@/components/domain/top-tracks-table";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, OfflineBanner } from "@/components/ui/state";
import { bucketByDay, currentStreak, joinTopTracks } from "@/lib/insights";
import { fa, faNumber, formatSpan } from "@/lib/format";
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

  const [stats, library, sessions] = await Promise.all([
    getMyStats(),
    getMyTracks({ page: 1, limit: JOIN_LIMIT, sortBy: "lastPlayedAt", sortOrder: "desc" }),
    getSessionsInWindow({ from: windowStart }),
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

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="کنسول شنیدن"
        title="خانه"
        description={
          data.lastListenedAt === null
            ? "هنوز چیزی ثبت نشده است."
            : `آخرین شنیدن: ${formatRelativeTime(data.lastListenedAt, now)}`
        }
        actions={
          <Button asChild variant="secondary" size="md">
            <Link href="/library">
              <Icon name="library" size="sm" />
              کتابخانه
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
            title="هنوز چیزی نشنیده‌اید"
            description="با پخش یک مجموعهٔ آنلاین، تاریخ شنیدن و آمار شما اینجا ساخته می‌شود. فایل‌های روی گوشی در نسخهٔ وب پخش نمی‌شوند."
            action={{ label: "کاوش مجموعه‌ها", href: "/browse" }}
          />
        </Card>
      ) : (
        <>
          <div className="grid gap-[var(--space-md)] sm:grid-cols-2 xl:grid-cols-4">
            <StatCell
              label="مجموع زمان شنیدن"
              value={formatSpan(data.totalListenTimeSec)}
              detail={
                data.firstListenedAt === null
                  ? undefined
                  : `از ${formatRelativeTime(data.firstListenedAt, now)}`
              }
              icon="clock"
            />
            <StatCell
              label="تعداد نشست‌ها"
              value={faNumber(data.sessionCount)}
              detail={streak > 0 ? `${fa(streak)} روز پیوسته` : "امروز شنیده نشده"}
              icon="stats"
            />
            <StatCell
              label="ترک‌های شنیده‌شده"
              value={faNumber(data.trackCount)}
              detail={`از ${faNumber(tracks.length)} ترک در کتابخانه`}
              icon="player"
            />
            <StatCell
              label="آخرین شنیدن"
              value={
                data.lastListenedAt === null ? "—" : formatRelativeTime(data.lastListenedAt, now)
              }
              detail="بر اساس پایان آخرین نشست"
              icon="history"
            />
          </div>

          <Card className="p-[var(--space-lg)]">
            <CardHeading overline="۳۰ روز گذشته" title="فعالیت شنیدن" />
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

          <section className="flex flex-col gap-[var(--space-md)]">
            <CardHeading overline="بیشترین زمان" title="ده ترک برتر" />

            {topRows.length === 0 ? (
              <Card>
                <EmptyState
                  icon="stats"
                  title="آماری برای نمایش نیست"
                  description="پس از چند نشست شنیدن، پرشنیده‌ترین ترک‌ها اینجا فهرست می‌شوند."
                />
              </Card>
            ) : (
              <TopTracksTable rows={topRows} now={now} />
            )}
          </section>
        </>
      )}
    </div>
  );
}
