import Link from "next/link";
import { Suspense } from "react";

import { adminListAuditLogs } from "@/app/actions/admin/audit/list-audit-logs";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/state";
import { fieldTrackClass } from "@/components/ui/text-field";
import { metadataEntries, type AdminAuditLog } from "@/lib/admin/domain/audit";
import type { AdminAuditQuery } from "@/lib/admin/query";
import { param, toQuery, type RawSearchParams } from "@/lib/admin/url";
import { pageParam } from "@/lib/search-params";
import { formatDateTime } from "@/lib/time";

export default async function AdminAuditPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);

  const query: AdminAuditQuery = {
    page,
    actorId: param(params, "actorId"),
    action: param(params, "action"),
    targetType: param(params, "targetType"),
    targetId: param(params, "targetId"),
    from: parseDate(param(params, "from"), false),
    to: parseDate(param(params, "to"), true),
  };

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Audit"
        description="Every successful mutation writes a row. Refusals are not logged. Filters are exact matches."
      />

      <Card className="p-[var(--space-lg)]">
        <form method="get" className="grid gap-[var(--space-md)] md:grid-cols-2 xl:grid-cols-12">
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">Action</span>
            <input
              name="action"
              defaultValue={param(params, "action") ?? ""}
              placeholder="user.update"
              className={fieldTrackClass}
            />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">Actor ID</span>
            <input
              name="actorId"
              defaultValue={param(params, "actorId") ?? ""}
              className={fieldTrackClass}
            />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">Target type</span>
            <input
              name="targetType"
              defaultValue={param(params, "targetType") ?? ""}
              placeholder="user"
              className={fieldTrackClass}
            />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">Target ID</span>
            <input
              name="targetId"
              defaultValue={param(params, "targetId") ?? ""}
              className={fieldTrackClass}
            />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">From</span>
            <input type="date" name="from" defaultValue={param(params, "from") ?? ""} className={fieldTrackClass} />
          </label>
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">To</span>
            <input type="date" name="to" defaultValue={param(params, "to") ?? ""} className={fieldTrackClass} />
          </label>

          <div className="flex items-end gap-[var(--space-sm)] xl:col-span-12">
            <Button type="submit" variant="primary" size="md">
              <Icon name="search" size="sm" />
              Filter
            </Button>
            <Button asChild variant="ghost" size="md">
              <Link href="/admin/audit">Clear</Link>
            </Button>
          </div>
        </form>
      </Card>

      <Suspense fallback={<TableSkeleton rows={12} />}>
        <AuditTable query={query} params={params} page={page} />
      </Suspense>
    </div>
  );
}

async function AuditTable({
  query,
  params,
  page,
}: {
  query: AdminAuditQuery;
  params: RawSearchParams;
  page: number;
}) {
  const result = await adminListAuditLogs(query);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref={`/admin/audit?${toQuery(params)}`} />;
  }

  if (result.body.rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="audit"
          title="No audit rows match"
          description="Only successful mutations are recorded. Clear a filter or widen the date range."
          action={{ label: "Clear filters", href: "/admin/audit" }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <div className="flex flex-col gap-[var(--space-sm)]">
        {result.body.rows.map((row) => (
          <AuditRow key={row.id} row={row} />
        ))}
      </div>

      <AdminPagination
        page={result.body.page || page}
        total={result.body.total}
        limit={result.body.limit || 25}
        buildHref={(next) => `/admin/audit?${toQuery(params, { page: String(next) })}`}
      />
    </div>
  );
}

function AuditRow({ row }: { row: AdminAuditLog }) {
  const href = targetHref(row);
  const entries = metadataEntries(row.metadata);
  const actor = row.actorEmail ?? row.actorId ?? "Unknown actor";

  return (
    <Card className="p-[var(--space-md)]">
      <div className="flex flex-wrap items-start justify-between gap-[var(--space-sm)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-[var(--space-xs)]">
            <Badge tone="neutral">{row.action}</Badge>
            {row.targetType ? <Badge tone="muted">{row.targetType}</Badge> : null}
            {row.targetId ? (
              href ? (
                <Link href={href} className="type-caption break-all text-accent hover:underline" dir="ltr">
                  {row.targetId}
                </Link>
              ) : (
                <span className="type-caption break-all text-text-tertiary" dir="ltr">
                  {row.targetId}
                </span>
              )
            ) : null}
          </div>
          <p className="type-label mt-[var(--space-xs)] text-text">{row.summary ?? "No summary"}</p>
        </div>

        <div className="text-end">
          <p className="type-caption text-text-secondary">{actor}</p>
          <p className="type-caption text-text-tertiary">
            {row.actorRole ? `${row.actorRole} · ` : ""}
            {row.createdAt === null ? "—" : formatDateTime(row.createdAt)}
          </p>
        </div>
      </div>

      {entries.length > 0 ? (
        <details className="mt-[var(--space-sm)]">
          <summary className="type-caption cursor-pointer select-none text-text-tertiary">Metadata</summary>
          <dl className="mt-[var(--space-sm)] grid gap-[var(--space-xs)]">
            {entries.map((entry) => (
              <div key={entry.key} className="grid gap-[var(--space-xs)] sm:grid-cols-[160px_minmax(0,1fr)]">
                <dt className="type-caption break-all text-text-tertiary">{entry.key}</dt>
                <dd className="type-caption break-all text-text-secondary" dir="ltr">
                  {entry.value}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </Card>
  );
}

function targetHref(row: AdminAuditLog): string | null {
  if (!row.targetId) {
    return null;
  }

  switch (row.targetType) {
    case "user":
      return `/admin/users/${row.targetId}`;
    case "subscription":
    case "aiUsage":
      return `/admin/users/${row.targetId}`;
    case "plan":
      return "/admin/plans";
    case "transaction":
      return `/admin/transactions?search=${encodeURIComponent(row.targetId)}&status=all`;
    case "platformSetting":
      return "/admin/platform";
    default:
      return null;
  }
}

function parseDate(value: string | undefined, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed) ? undefined : parsed;
}
