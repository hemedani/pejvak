import Link from "next/link";
import { Suspense } from "react";

import { getMe } from "@/app/actions/auth/get-me";
import { adminListSubscriptions } from "@/app/actions/admin/subscriptions/list-subscriptions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SubscriptionRevoke } from "@/components/admin/subscription-revoke";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/state";
import { fieldTrackClass } from "@/components/ui/text-field";
import type { AdminSubscription } from "@/lib/admin/domain/subscriptions";
import { sortSubscriptionsForDisplay } from "@/lib/admin/domain/subscriptions";
import { formatEnum } from "@/lib/admin/format";
import type { AdminSubscriptionQuery } from "@/lib/admin/query";
import { param, toQuery, type RawSearchParams } from "@/lib/admin/url";
import { pageParam } from "@/lib/search-params";
import { formatDate } from "@/lib/time";

export default async function AdminSubscriptionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);

  const query: AdminSubscriptionQuery = {
    page,
    status: param(params, "status"),
    planCode: param(params, "planCode"),
    search: param(params, "search"),
  };

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Subscriptions"
        description="Who is paying, for what, until when. Lifetime rows have no end and are listed after every dated row."
      />

      <Card className="p-[var(--space-lg)]">
        <form method="get" className="grid gap-[var(--space-md)] md:grid-cols-2 xl:grid-cols-12">
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-4">
            <span className="type-label text-text">Account search</span>
            <input
              name="search"
              defaultValue={param(params, "search") ?? ""}
              placeholder="Email or username"
              className={fieldTrackClass}
            />
          </label>

          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-3">
            <span className="type-label text-text">Status</span>
            <select name="status" defaultValue={param(params, "status") ?? ""} className={fieldTrackClass}>
              <option value="">Any status</option>
              {["active", "trialing", "past_due", "canceled", "expired"].map((status) => (
                <option key={status} value={status}>
                  {formatEnum(status)}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-3">
            <span className="type-label text-text">Plan code</span>
            <input
              name="planCode"
              defaultValue={param(params, "planCode") ?? ""}
              placeholder="pro"
              className={fieldTrackClass}
            />
          </label>

          <div className="flex items-end gap-[var(--space-sm)] xl:col-span-2">
            <Button type="submit" variant="primary" size="md">
              <Icon name="search" size="sm" />
              Filter
            </Button>
            <Button asChild variant="ghost" size="md">
              <Link href="/admin/subscriptions">Clear</Link>
            </Button>
          </div>
        </form>
      </Card>

      <Suspense fallback={<TableSkeleton rows={10} />}>
        <SubscriptionsTable query={query} params={params} page={page} />
      </Suspense>
    </div>
  );
}

async function SubscriptionsTable({
  query,
  params,
  page,
}: {
  query: AdminSubscriptionQuery;
  params: RawSearchParams;
  page: number;
}) {
  const [result, me] = await Promise.all([adminListSubscriptions(query), getMe()]);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref={`/admin/subscriptions?${toQuery(params)}`} />;
  }

  if (result.body.rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="repeat"
          title="No subscriptions match"
          description="A listener on the free plan has no subscription row. Clear the filters to see everything."
          action={{ label: "Clear filters", href: "/admin/subscriptions" }}
        />
      </Card>
    );
  }

  const canMutate = me.success && me.body.role === "admin";
  const rows = sortSubscriptionsForDisplay(result.body.rows);

  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-outline-variant bg-surface shadow-[var(--elevation-card)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">Subscriptions</caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <Th>Account</Th>
                <Th>Plan</Th>
                <Th>Status</Th>
                <Th className="hidden md:table-cell">Period end</Th>
                <Th className="hidden lg:table-cell">Provider</Th>
                <Th className="hidden xl:table-cell">Renewal</Th>
                {canMutate ? <Th className="text-end">Action</Th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Row key={row.id} row={row} canMutate={canMutate} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AdminPagination
        page={result.body.page || page}
        total={result.body.total}
        limit={result.body.limit || 25}
        buildHref={(next) => `/admin/subscriptions?${toQuery(params, { page: String(next) })}`}
      />
    </div>
  );
}

function Row({ row, canMutate }: { row: AdminSubscription; canMutate: boolean }) {
  return (
    <tr className="border-b border-outline-variant last:border-b-0 hover:bg-surface-sunken/60">
      <td className="py-[var(--space-md)] pe-[var(--space-md)] ps-[var(--space-md)]">
        {row.user?.id ? (
          <Link href={`/admin/users/${row.user.id}`} className="type-label block truncate text-text hover:underline">
            {row.user.email ?? row.user.username ?? row.user.id}
          </Link>
        ) : (
          <p className="type-label text-text-tertiary">Account removed</p>
        )}
        {row.user?.username ? (
          <p className="type-caption text-text-tertiary">{row.user.username}</p>
        ) : null}
      </td>
      <td className="py-[var(--space-md)] pe-[var(--space-md)]">
        <p className="type-label text-text">{row.planCode}</p>
        <p className="type-caption text-text-tertiary">{formatEnum(row.status)}</p>
      </td>
      <td className="py-[var(--space-md)] pe-[var(--space-md)]">
        <Badge
          tone={
            row.status === "active"
              ? "accent"
              : row.status === "past_due"
                ? "danger"
                : row.status === "trialing"
                  ? "neutral"
                  : "muted"
          }
        >
          {formatEnum(row.status)}
        </Badge>
        {row.cancelAtPeriodEnd ? <Badge tone="muted" className="ms-[var(--space-xs)]">Cancels</Badge> : null}
      </td>
      <td className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary md:table-cell">
        {row.currentPeriodEnd === null ? "No end (lifetime or none)" : formatDate(row.currentPeriodEnd)}
      </td>
      <td className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary lg:table-cell">
        {formatEnum(row.provider)}
        {row.autoRenew ? <span className="block text-text-tertiary">auto-renew</span> : null}
      </td>
      <td className="type-caption hidden max-w-[220px] py-[var(--space-md)] pe-[var(--space-md)] text-text-tertiary xl:table-cell">
        {row.note ?? "—"}
      </td>
      {canMutate ? (
        <td className="py-[var(--space-md)] pe-[var(--space-md)] text-end">
          {row.user?.id ? <SubscriptionRevoke userId={row.user.id} planCode={row.planCode} /> : null}
        </td>
      ) : null}
    </tr>
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
