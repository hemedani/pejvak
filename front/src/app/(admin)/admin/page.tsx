import { Suspense } from "react";

import { adminGetOverview } from "@/app/actions/admin/analytics/get-overview";
import { StatCell } from "@/components/domain/stat-cell";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeading } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { ErrorState, Skeleton, TableSkeleton } from "@/components/ui/state";
import { formatMoney, formatRate } from "@/lib/admin/format";
import type { AdminOverview } from "@/lib/admin/domain/analytics";
import { formatBytes, formatNumber, formatSpan } from "@/lib/format";
import { formatDateTime } from "@/lib/time";

export default function AdminOverviewPage() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Overview"
        description="The platform's own numbers, computed from the rows that define them."
      />

      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewData />
      </Suspense>
    </div>
  );
}

async function OverviewData() {
  const result = await adminGetOverview();

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref="/admin" />;
  }

  return <OverviewContent overview={result.body} />;
}

function OverviewContent({ overview }: { overview: AdminOverview }) {
  const { users, activity, content, revenue, quota } = overview;

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <section aria-labelledby="accounts-heading" className="flex flex-col gap-[var(--space-md)]">
        <h2 id="accounts-heading" className="type-heading text-text">
          Accounts
        </h2>
        <div className="grid gap-[var(--space-md)] sm:grid-cols-2 xl:grid-cols-4">
          <StatCell label="Total accounts" value={formatNumber(users.total)} />
          <StatCell label="Active" value={formatNumber(users.active)} detail="not suspended or deleted" />
          <StatCell label="Suspended" value={formatNumber(users.suspended)} />
          <StatCell
            label="New (24h / 7d / 30d)"
            value={`${formatNumber(users.newLast24h)} / ${formatNumber(users.newLast7d)} / ${formatNumber(users.newLast30d)}`}
          />
        </div>
      </section>

      <section aria-labelledby="activity-heading" className="flex flex-col gap-[var(--space-md)]">
        <h2 id="activity-heading" className="type-heading text-text">
          Engagement
        </h2>
        <div className="grid gap-[var(--space-md)] sm:grid-cols-2 xl:grid-cols-4">
          <StatCell
            label="Active listeners"
            value={`${formatNumber(activity.activeLast24h)} / ${formatNumber(activity.activeLast7d)} / ${formatNumber(activity.activeLast30d)}`}
            detail="24 hours / 7 days / 30 days"
          />
          <StatCell label="Sessions" value={formatNumber(content.sessions)} />
          <StatCell label="Listening time" value={formatSpan(content.listenTimeSec)} />
          <StatCell
            label="Last session"
            value={content.lastSessionAt === null ? "—" : formatDateTime(content.lastSessionAt)}
          />
        </div>
      </section>

      <div className="grid gap-[var(--space-lg)] xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <Card className="p-[var(--space-xl)]">
          <CardHeading overline="Content" title="What the platform holds" />
          <div className="mt-[var(--space-lg)] grid grid-cols-2 gap-[var(--space-lg)] sm:grid-cols-3">
            <Metric label="Tracks" value={formatNumber(content.tracks)} />
            <Metric label="Storage" value={formatBytesOrDash(content.storageBytes)} />
            <Metric label="Annotations" value={formatNumber(content.annotations)} />
            <Metric label="Playlists" value={formatNumber(content.playlists)} />
            <Metric label="Playback contexts" value={formatNumber(content.contexts)} />
            <Metric label="Saved collections" value={formatNumber(content.onlineCollections)} />
          </div>
        </Card>

        <Card className="p-[var(--space-xl)]">
          <CardHeading overline="Revenue" title="Current book of business" />
          <div className="mt-[var(--space-lg)] grid grid-cols-2 gap-[var(--space-lg)]">
            <Metric label="MRR" value={formatMoney(revenue.mrrCents, revenue.currency)} />
            <Metric label="Paying listeners" value={formatNumber(revenue.payingUsers)} />
            <Metric label="ARPU" value={formatMoney(revenue.arpuCents, revenue.currency)} />
            <Metric label="Conversion" value={formatRate(revenue.conversionRate)} />
          </div>

          <div className="mt-[var(--space-lg)] border-t border-outline-variant pt-[var(--space-md)]">
            <p className="type-overline text-text-tertiary">Plan distribution</p>
            {revenue.planDistribution.length === 0 ? (
              <p className="type-caption mt-[var(--space-sm)] text-text-tertiary">
                No plans have been created yet.
              </p>
            ) : (
              <ul className="mt-[var(--space-sm)] flex flex-col gap-[var(--space-xs)]">
                {revenue.planDistribution.map((row) => (
                  <li key={row.planCode} className="flex items-center justify-between gap-[var(--space-md)]">
                    <span className="type-caption flex min-w-0 items-center gap-[var(--space-xs)] text-text-secondary">
                      <span dir="auto" className="truncate">{row.title ?? row.planCode}</span>
                      {!row.isActive ? <Badge tone="muted">Archived</Badge> : null}
                    </span>
                    <span className="type-numeric text-text">{formatNumber(row.users)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      </div>

      <Card className="p-[var(--space-xl)]">
        <CardHeading overline="History quota" title="Pressure against the free cap" />
        <div className="mt-[var(--space-lg)] grid gap-[var(--space-lg)] sm:grid-cols-2">
          <Metric
            label="Free history limit"
            value={quota.freeHistoryLimit === -1 ? "Unlimited" : formatNumber(quota.freeHistoryLimit)}
          />
          <Metric
            label="Accounts at or above the cap"
            value={formatNumber(quota.usersAtLimit)}
            note="All accounts, not only those on the free plan."
          />
        </div>
      </Card>

      <p className="type-caption text-text-tertiary">
        Generated {overview.generatedAt === null ? "—" : formatDateTime(overview.generatedAt)}.
      </p>
    </div>
  );
}

function Metric({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note?: string;
}) {
  return (
    <div>
      <p className="type-overline text-text-tertiary">{label}</p>
      <p className="type-numeric mt-[var(--space-xxs)] text-text">{value}</p>
      {note ? <p className="type-caption mt-[2px] text-text-tertiary">{note}</p> : null}
    </div>
  );
}

function formatBytesOrDash(bytes: number): string {
  return bytes > 0 ? formatBytes(bytes) : "—";
}

function OverviewSkeleton() {
  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <div className="grid gap-[var(--space-md)] sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28 w-full" />
        ))}
      </div>
      <TableSkeleton rows={4} />
    </div>
  );
}
