import { Suspense } from "react";

import { adminGetRetention } from "@/app/actions/admin/analytics/get-retention";
import { adminGetTimeseries } from "@/app/actions/admin/analytics/get-timeseries";
import { adminGetTopTracks } from "@/app/actions/admin/analytics/get-top-tracks";
import { TimeseriesChart } from "@/components/admin/timeseries-chart";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeading } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, Skeleton, TableSkeleton } from "@/components/ui/state";
import type { AdminRetention, AdminTimeseries, AdminTopTracks } from "@/lib/admin/domain/analytics";
import { formatRate } from "@/lib/admin/format";
import { formatNumber, formatSpan } from "@/lib/format";

export default function AdminAnalyticsPage() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Analytics"
        description="Daily activity, the loudest tracks and weekly cohorts — all computed by the backend."
      />

      <Suspense fallback={<Skeleton className="h-[320px] w-full" />}>
        <TimeseriesSection />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={8} />}>
        <TopTracksSection />
      </Suspense>

      <Suspense fallback={<TableSkeleton rows={6} />}>
        <RetentionSection />
      </Suspense>
    </div>
  );
}

async function TimeseriesSection() {
  const result = await adminGetTimeseries(30);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref="/admin/analytics" />;
  }

  const series: AdminTimeseries = result.body;

  return (
    <Card className="p-[var(--space-xl)]">
      <CardHeading overline="Last 30 days" title="Daily activity" />
      <div className="mt-[var(--space-lg)]">
        {series.days.every((point) => point.sessions === 0 && point.signups === 0) ? (
          <EmptyState
            icon="activity"
            title="No activity in the window"
            description="When listeners start playing, sessions and signups will appear here."
          />
        ) : (
          <TimeseriesChart series={series} />
        )}
      </div>
    </Card>
  );
}

async function TopTracksSection() {
  const result = await adminGetTopTracks(30, 10);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref="/admin/analytics" />;
  }

  const tracks: AdminTopTracks = result.body;

  return (
    <Card className="p-[var(--space-xl)]">
      <CardHeading overline="Last 30 days" title="Most-listened tracks" />
      <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
        Ranked by listening time, not play count — a skip is not a listen.
      </p>

      <div className="mt-[var(--space-lg)]">
        {tracks.rows.length === 0 ? (
          <EmptyState
            icon="stats"
            title="Nothing has been listened to"
            description="This ranking fills once sessions arrive from the apps."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">Most-listened tracks across the platform</caption>
              <thead>
                <tr className="border-b border-outline-variant">
                  <Th className="w-10 text-center">#</Th>
                  <Th>Track</Th>
                  <Th className="hidden sm:table-cell">Listening</Th>
                  <Th className="hidden text-center md:table-cell">Plays</Th>
                  <Th className="hidden text-center lg:table-cell">Listeners</Th>
                </tr>
              </thead>
              <tbody>
                {tracks.rows.map((row, index) => (
                  <tr
                    key={`${row.contentHash ?? row.trackId ?? row.title}:${index}`}
                    className="border-b border-outline-variant last:border-b-0"
                  >
                    <td className="type-numeric py-[var(--space-md)] text-center text-text-tertiary">
                      {index + 1}
                    </td>
                    <td className="py-[var(--space-md)] pe-[var(--space-md)]">
                      <p dir="auto" className="type-label truncate text-text">{row.title}</p>
                      <p dir="auto" className="type-caption truncate text-text-tertiary">
                        {row.author ?? "Unknown author"}
                        {row.isAudiobook ? " · Audiobook" : ""}
                      </p>
                    </td>
                    <td className="type-numeric hidden py-[var(--space-md)] text-text-secondary sm:table-cell">
                      {formatSpan(row.listenTimeSec)}
                    </td>
                    <td className="type-numeric hidden py-[var(--space-md)] text-center text-text-secondary md:table-cell">
                      {formatNumber(row.playCount)}
                    </td>
                    <td className="type-numeric hidden py-[var(--space-md)] text-center text-text-secondary lg:table-cell">
                      {formatNumber(row.listenerCount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

async function RetentionSection() {
  const result = await adminGetRetention(6, 6);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref="/admin/analytics" />;
  }

  const retention: AdminRetention = result.body;
  const empty = retention.cohorts.every((cohort) => cohort.size === 0);

  return (
    <Card className="p-[var(--space-xl)]">
      <CardHeading overline="Weekly cohorts" title="Retention" />
      <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">
        Each row is the accounts created in one Monday–Sunday UTC week. Week 0 is the
        signup week, so it is a sanity check rather than a metric.
      </p>

      <div className="mt-[var(--space-lg)]">
        {empty ? (
          <EmptyState
            icon="users"
            title="No cohorts in the window"
            description="The table appears once accounts have been created and have listened."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-start">
              <caption className="sr-only">Weekly cohort retention</caption>
              <thead>
                <tr className="border-b border-outline-variant">
                  <Th>Cohort</Th>
                  <Th className="text-center">Size</Th>
                  {Array.from({ length: retention.weeks }, (_, week) => (
                    <Th key={week} className="text-center">
                      W{week}
                    </Th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {retention.cohorts.map((cohort) => (
                  <tr key={cohort.cohortDate} className="border-b border-outline-variant last:border-b-0">
                    <td className="type-caption py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary">
                      {cohort.cohortDate}
                    </td>
                    <td className="type-numeric py-[var(--space-md)] text-center text-text">
                      {formatNumber(cohort.size)}
                    </td>
                    {Array.from({ length: retention.weeks }, (_, week) => {
                      const cell = cohort.weeks.find((entry) => entry.week === week);
                      return (
                        <td key={week} className="py-[var(--space-md)] text-center">
                          {cell ? (
                            <span title={`${formatNumber(cell.activeUsers)} listeners`}>
                              {formatRate(cell.rate)}
                            </span>
                          ) : (
                            <Badge tone="muted">—</Badge>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Card>
  );
}

function Th({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={`type-caption px-[var(--space-md)] py-[var(--space-sm)] font-semibold text-text-tertiary ${
        className ?? "text-start"
      }`}
    >
      {children}
    </th>
  );
}
