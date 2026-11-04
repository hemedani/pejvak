import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";

import { getMe } from "@/app/actions/auth/get-me";
import { adminListAuditLogs } from "@/app/actions/admin/audit/list-audit-logs";
import { adminListPlans } from "@/app/actions/admin/plans/list-plans";
import { adminGetUser } from "@/app/actions/admin/users/get-user";
import { adminGetUserHistory } from "@/app/actions/admin/users/get-user-history";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { UserActions } from "@/components/admin/user-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeading } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/state";
import { fieldTrackClass } from "@/components/ui/text-field";
import { formatEnum, formatLimit, formatRole, formatStatus } from "@/lib/admin/format";
import type { AdminAuditLog } from "@/lib/admin/domain/audit";
import type { AdminPlan } from "@/lib/admin/domain/plans";
import type { UserDetail, UserSessionRow } from "@/lib/admin/domain/users";
import { param, toQuery, type RawSearchParams } from "@/lib/admin/url";
import { formatBytes, formatNumber, formatSpan } from "@/lib/format";
import { pageParam } from "@/lib/search-params";
import { formatDate, formatDateTime } from "@/lib/time";

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<RawSearchParams>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const [userResult, me] = await Promise.all([adminGetUser(id, 10), getMe()]);

  if (!userResult.success) {
    if (userResult.error.kind === "validation" && /not found/i.test(userResult.error.message)) {
      notFound();
    }
    return <ErrorState failure={userResult.error} retryHref={`/admin/users/${id}`} />;
  }

  const detail = userResult.body;
  const canMutate = me.success && me.body.role === "admin";
  const currentUserId = me.success ? me.body.id : "";

  const plansResult = canMutate ? await adminListPlans(true) : null;
  const plans: AdminPlan[] = plansResult?.success ? plansResult.body.rows : [];

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Account"
        title={detail.user.email || detail.user.username || "Unnamed account"}
        description={`ID ${detail.user.id}`}
        actions={
          <Button asChild variant="ghost" size="md">
            <Link href="/admin/users">Back to users</Link>
          </Button>
        }
      />

      <div className="flex flex-wrap items-center gap-[var(--space-sm)]">
        <Badge tone={detail.user.role === "admin" ? "accent" : "neutral"}>{formatRole(detail.user.role)}</Badge>
        <Badge
          tone={
            detail.user.status === "active"
              ? "neutral"
              : detail.user.status === "suspended"
                ? "danger"
                : "muted"
          }
        >
          {formatStatus(detail.user.status)}
        </Badge>
        {detail.entitlement?.planCode ? <Badge tone="accent">{detail.entitlement.planCode}</Badge> : null}
      </div>

      <div className="grid gap-[var(--space-lg)] xl:grid-cols-2">
        <Card className="p-[var(--space-xl)]">
          <CardHeading overline="Identity" title="Account" />
          <dl className="mt-[var(--space-lg)] grid gap-[var(--space-md)] sm:grid-cols-2">
            <Fact label="Username" value={detail.user.username || "—"} />
            <Fact label="Display name" value={detail.user.displayName ?? "—"} />
            <Fact label="Email" value={detail.user.email || "—"} />
            <Fact label="Role" value={formatRole(detail.user.role)} />
            <Fact label="Status" value={formatStatus(detail.user.status)} />
            <Fact label="Created" value={detail.user.createdAt === null ? "—" : formatDateTime(detail.user.createdAt)} />
            <Fact label="Updated" value={detail.user.updatedAt === null ? "—" : formatDateTime(detail.user.updatedAt)} />
            {detail.user.status === "suspended" ? (
              <>
                <Fact label="Suspended at" value={detail.user.suspendedAt === null ? "—" : formatDateTime(detail.user.suspendedAt)} />
                <Fact label="Suspension reason" value={detail.user.suspendedReason ?? "—"} />
              </>
            ) : null}
          </dl>
        </Card>

        <Card className="p-[var(--space-xl)]">
          <CardHeading overline="Entitlement" title="What the account can do" />
          {detail.entitlement === null ? (
            <p className="type-caption mt-[var(--space-md)] text-text-tertiary">
              The backend returned no resolved entitlement for this account.
            </p>
          ) : (
            <>
              <dl className="mt-[var(--space-lg)] grid gap-[var(--space-md)] sm:grid-cols-2">
                <Fact label="Plan" value={detail.entitlement.planTitle ?? detail.entitlement.planCode ?? "—"} />
                <Fact label="Paid" value={detail.entitlement.isPaid ? "Yes" : "No"} />
                <Fact label="Subscription" value={formatEnum(detail.entitlement.subscriptionStatus ?? "none")} />
                <Fact
                  label="Period end"
                  value={
                    detail.entitlement.currentPeriodEnd === null
                      ? "No end (lifetime or none)"
                      : formatDateTime(detail.entitlement.currentPeriodEnd)
                  }
                />
                <Fact label="Cancels at period end" value={detail.entitlement.cancelAtPeriodEnd ? "Yes" : "No"} />
                <Fact label="Auto-renew" value={detail.entitlement.autoRenew ? "Yes" : "No"} />
              </dl>
              <div className="mt-[var(--space-lg)] grid grid-cols-2 gap-[var(--space-md)] border-t border-outline-variant pt-[var(--space-md)] sm:grid-cols-3">
                <Fact label="History entries" value={formatLimit(detail.entitlement.limits.historyEntries)} />
                <Fact label="Playlists" value={formatLimit(detail.entitlement.limits.playlists)} />
                <Fact label="Tracks" value={formatLimit(detail.entitlement.limits.maxTracks)} />
                <Fact label="AI credits / month" value={formatLimit(detail.entitlement.limits.aiCreditsPerMonth)} />
                <Fact label="Cross-device sync" value={detail.entitlement.limits.crossDeviceSync ? "On" : "Off"} />
              </div>
            </>
          )}
        </Card>
      </div>

      <div className="grid gap-[var(--space-lg)] xl:grid-cols-2">
        <Card className="p-[var(--space-xl)]">
          <CardHeading overline="Quota" title="History quota" />
          {detail.historyQuota === null ? (
            <p className="type-caption mt-[var(--space-md)] text-text-tertiary">Not reported by the backend.</p>
          ) : (
            <dl className="mt-[var(--space-lg)] grid grid-cols-2 gap-[var(--space-md)]">
              <Fact label="Limit" value={detail.historyQuota.unlimited ? "Unlimited" : formatLimit(detail.historyQuota.limit ?? 0)} />
              <Fact label="Used" value={formatNumber(detail.historyQuota.used)} />
              <Fact
                label="Remaining"
                value={
                  detail.historyQuota.unlimited
                    ? "Unlimited"
                    : detail.historyQuota.remaining === null
                      ? "—"
                      : formatNumber(detail.historyQuota.remaining)
                }
              />
            </dl>
          )}
        </Card>

        <Card className="p-[var(--space-xl)]">
          <CardHeading overline="Usage" title="What this account holds" />
          <dl className="mt-[var(--space-lg)] grid grid-cols-2 gap-[var(--space-md)] sm:grid-cols-3">
            <Fact label="Sessions" value={formatNumber(detail.usage.sessionCount)} />
            <Fact label="Listening" value={formatSpan(detail.usage.listenTimeSec)} />
            <Fact label="Tracks" value={formatNumber(detail.usage.trackCount)} />
            <Fact label="Storage" value={detail.usage.storageBytes > 0 ? formatBytes(detail.usage.storageBytes) : "—"} />
            <Fact label="Annotations" value={formatNumber(detail.usage.annotationCount)} />
            <Fact label="Playlists" value={formatNumber(detail.usage.playlistCount)} />
            <Fact label="Contexts" value={formatNumber(detail.usage.contextCount)} />
            <Fact label="Saved collections" value={formatNumber(detail.usage.onlineCollectionCount)} />
            <Fact
              label="Last active"
              value={detail.usage.lastActiveAt === null ? "—" : formatDateTime(detail.usage.lastActiveAt)}
            />
          </dl>
        </Card>
      </div>

      <section className="flex flex-col gap-[var(--space-md)]">
        <h2 className="type-heading text-text">Actions</h2>
        <UserActions
          user={detail.user}
          entitlement={detail.entitlement}
          plans={plans}
          currentUserId={currentUserId}
          canMutate={canMutate}
        />
      </section>

      <section className="flex flex-col gap-[var(--space-md)]">
        <h2 className="type-heading text-text">Recent sessions</h2>
        <RecentSessions sessions={detail.recentSessions} />
      </section>

      <section className="flex flex-col gap-[var(--space-md)]">
        <h2 className="type-heading text-text">History</h2>
        <HistoryFilters userId={detail.user.id} params={query} />
        <Suspense fallback={<TableSkeleton rows={8} />}>
          <HistorySection userId={detail.user.id} params={query} />
        </Suspense>
      </section>

      <section className="flex flex-col gap-[var(--space-md)]">
        <h2 className="type-heading text-text">Scoped audit trail</h2>
        <Suspense fallback={<TableSkeleton rows={4} />}>
          <ScopedAudit userId={detail.user.id} />
        </Suspense>
      </section>
    </div>
  );
}

async function HistorySection({ userId, params }: { userId: string; params: RawSearchParams }) {
  const page = pageParam(params.historyPage);
  const contentHash = param(params, "contentHash");
  const fromDate = param(params, "from");
  const toDate = param(params, "to");

  const from = parseDate(fromDate, false);
  const to = parseDate(toDate, true);

  const result = await adminGetUserHistory(userId, {
    page,
    limit: 25,
    contentHash,
    from,
    to,
  });

  if (!result.success) {
    return (
      <ErrorState
        failure={result.error}
        retryHref={`/admin/users/${userId}?${toQuery(params)}`}
      />
    );
  }

  if (result.body.rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="history"
          title="No sessions match"
          description="Clear the content hash or date range to see the account's whole history."
          action={{ label: "Clear filters", href: `/admin/users/${userId}` }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <SessionTable rows={result.body.rows} />
      <AdminPagination
        page={result.body.page || page}
        total={result.body.total}
        limit={result.body.limit || 25}
        buildHref={(next) => `/admin/users/${userId}?${toQuery(params, { historyPage: String(next) })}`}
      />
    </div>
  );
}

async function ScopedAudit({ userId }: { userId: string }) {
  const result = await adminListAuditLogs({
    page: 1,
    limit: 10,
    targetType: "user",
    targetId: userId,
  });

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref={`/admin/users/${userId}`} />;
  }

  if (result.body.rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="audit"
          title="Nothing has been done to this account"
          description="Role changes, suspensions, grants and password resets will appear here."
        />
      </Card>
    );
  }

  return <AuditList rows={result.body.rows} />;
}

function RecentSessions({ sessions }: { sessions: UserSessionRow[] }) {
  if (sessions.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="history"
          title="No sessions yet"
          description="Listening history arrives from the phone's background sync."
        />
      </Card>
    );
  }

  return <SessionTable rows={sessions} />;
}

function SessionTable({ rows }: { rows: UserSessionRow[] }) {
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-outline-variant bg-surface shadow-[var(--elevation-card)]">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">Playback sessions</caption>
          <thead>
            <tr className="border-b border-outline-variant">
              <Th>Started</Th>
              <Th>Track</Th>
              <Th className="hidden sm:table-cell">Listened</Th>
              <Th className="hidden md:table-cell">Outcome</Th>
              <Th className="hidden lg:table-cell">Context</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((session) => (
              <tr key={session.id} className="border-b border-outline-variant last:border-b-0">
                <td className="type-caption py-[var(--space-md)] pe-[var(--space-md)] ps-[var(--space-md)] text-text-secondary">
                  {session.startedAt === null ? "—" : formatDateTime(session.startedAt)}
                </td>
                <td className="py-[var(--space-md)] pe-[var(--space-md)]">
                  <p className="type-label truncate text-text">{session.trackTitle ?? "Unknown track"}</p>
                  {session.contentHash ? (
                    <p className="type-caption truncate text-text-tertiary" dir="ltr">
                      {session.contentHash.slice(0, 16)}…
                    </p>
                  ) : null}
                </td>
                <td className="type-numeric hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary sm:table-cell">
                  {session.durationListenedSec === null ? "—" : formatSpan(session.durationListenedSec)}
                </td>
                <td className="hidden py-[var(--space-md)] pe-[var(--space-md)] md:table-cell">
                  {session.completed ? (
                    <Badge tone="accent">Completed</Badge>
                  ) : session.interrupted ? (
                    <Badge tone="danger">Interrupted</Badge>
                  ) : (
                    <Badge tone="muted">Partial</Badge>
                  )}
                </td>
                <td className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-tertiary lg:table-cell">
                  {session.contextType ?? "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function HistoryFilters({ userId, params }: { userId: string; params: RawSearchParams }) {
  return (
    <Card className="p-[var(--space-lg)]">
      <form method="get" action={`/admin/users/${userId}`} className="grid gap-[var(--space-md)] md:grid-cols-4">
        <label className="flex flex-col gap-[var(--space-xs)] md:col-span-2">
          <span className="type-label text-text">Content hash</span>
          <input
            name="contentHash"
            defaultValue={param(params, "contentHash") ?? ""}
            className={fieldTrackClass}
            placeholder="Exact SHA-256"
          />
        </label>
        <label className="flex flex-col gap-[var(--space-xs)]">
          <span className="type-label text-text">From</span>
          <input type="date" name="from" defaultValue={param(params, "from") ?? ""} className={fieldTrackClass} />
        </label>
        <label className="flex flex-col gap-[var(--space-xs)]">
          <span className="type-label text-text">To</span>
          <input type="date" name="to" defaultValue={param(params, "to") ?? ""} className={fieldTrackClass} />
        </label>
        <div className="flex items-end gap-[var(--space-sm)] md:col-span-4">
          <Button type="submit" variant="secondary" size="md">
            Filter history
          </Button>
          <Button asChild variant="ghost" size="md">
            <Link href={`/admin/users/${userId}`}>Clear</Link>
          </Button>
        </div>
      </form>
    </Card>
  );
}

function AuditList({ rows }: { rows: AdminAuditLog[] }) {
  return (
    <Card className="divide-y divide-[var(--outline-variant)]">
      {rows.map((row) => (
        <div key={row.id} className="flex flex-wrap items-start justify-between gap-[var(--space-sm)] p-[var(--space-md)]">
          <div className="min-w-0">
            <p className="type-label text-text">{row.action}</p>
            <p className="type-caption text-text-tertiary">{row.summary ?? "No summary"}</p>
          </div>
          <div className="text-end">
            <p className="type-caption text-text-tertiary">{row.actorEmail ?? row.actorId ?? "Unknown actor"}</p>
            <p className="type-caption text-text-tertiary">{row.createdAt === null ? "—" : formatDateTime(row.createdAt)}</p>
          </div>
        </div>
      ))}
    </Card>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="type-overline text-text-tertiary">{label}</dt>
      <dd className="type-caption mt-[2px] break-words text-text">{value}</dd>
    </div>
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

function parseDate(value: string | undefined, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed) ? undefined : parsed;
}
