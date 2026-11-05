import Link from "next/link";
import { Suspense } from "react";

import { getMe } from "@/app/actions/auth/get-me";
import { adminListTransactions } from "@/app/actions/admin/transactions/list-transactions";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { TransactionActions } from "@/components/admin/transaction-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/state";
import { fieldTrackClass } from "@/components/ui/text-field";
import type { AdminTransaction } from "@/lib/admin/domain/transactions";
import { formatEnum, formatMoney } from "@/lib/admin/format";
import type { AdminTransactionQuery } from "@/lib/admin/query";
import { param, toQuery, type RawSearchParams } from "@/lib/admin/url";
import { pageParam } from "@/lib/search-params";
import { formatDate, formatDateTime } from "@/lib/time";

export default async function AdminTransactionsPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);
  const statusParam = param(params, "status");

  const query: AdminTransactionQuery = {
    page,
    status: statusParam === "all" ? undefined : statusParam ?? "pending",
    provider: param(params, "provider"),
    planCode: param(params, "planCode"),
    search: param(params, "search"),
    from: parseDate(param(params, "from"), false),
    to: parseDate(param(params, "to"), true),
  };

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Transactions"
        description="The ledger, newest first. Pending is the manual-provider work queue, not an error state."
      />

      <Card className="p-[var(--space-lg)]">
        <form method="get" className="grid gap-[var(--space-md)] md:grid-cols-2 xl:grid-cols-12">
          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-3">
            <span className="type-label text-text">Status</span>
            <select name="status" defaultValue={statusParam ?? "pending"} className={fieldTrackClass}>
              <option value="pending">Pending</option>
              <option value="paid">Paid</option>
              <option value="failed">Failed</option>
              <option value="canceled">Canceled</option>
              <option value="refunded">Refunded</option>
              <option value="all">All statuses</option>
            </select>
          </label>

          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">Provider</span>
            <input
              name="provider"
              defaultValue={param(params, "provider") ?? ""}
              placeholder="manual"
              className={fieldTrackClass}
            />
          </label>

          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
            <span className="type-label text-text">Plan code</span>
            <input
              name="planCode"
              defaultValue={param(params, "planCode") ?? ""}
              placeholder="pro"
              className={fieldTrackClass}
            />
          </label>

          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-3">
            <span className="type-label text-text">Account or reference</span>
            <input
              name="search"
              defaultValue={param(params, "search") ?? ""}
              placeholder="Email or reference"
              className={fieldTrackClass}
            />
          </label>

          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-1">
            <span className="type-label text-text">From</span>
            <input type="date" name="from" defaultValue={param(params, "from") ?? ""} className={fieldTrackClass} />
          </label>

          <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-1">
            <span className="type-label text-text">To</span>
            <input type="date" name="to" defaultValue={param(params, "to") ?? ""} className={fieldTrackClass} />
          </label>

          <div className="flex items-end gap-[var(--space-sm)] xl:col-span-12">
            <Button type="submit" variant="primary" size="md">
              <Icon name="search" size="sm" />
              Filter
            </Button>
            <Button asChild variant="ghost" size="md">
              <Link href="/admin/transactions">Reset to pending</Link>
            </Button>
          </div>
        </form>
      </Card>

      <Suspense fallback={<TableSkeleton rows={10} />}>
        <TransactionsTable query={query} params={params} page={page} />
      </Suspense>
    </div>
  );
}

async function TransactionsTable({
  query,
  params,
  page,
}: {
  query: AdminTransactionQuery;
  params: RawSearchParams;
  page: number;
}) {
  const [result, me] = await Promise.all([adminListTransactions(query), getMe()]);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref={`/admin/transactions?${toQuery(params)}`} />;
  }

  if (result.body.rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="receipt"
          title="No transactions match"
          description={
            query.status === "pending"
              ? "The manual work queue is empty. Paid, failed and refunded rows are behind the status filter."
              : "Clear a filter or widen the date range."
          }
          action={{ label: "Reset to pending", href: "/admin/transactions" }}
        />
      </Card>
    );
  }

  const canMutate = me.success && me.body.role === "admin";

  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-outline-variant bg-surface shadow-[var(--elevation-card)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">Billing transactions</caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <Th>Created</Th>
                <Th>Amount</Th>
                <Th>Account</Th>
                <Th className="hidden md:table-cell">Plan</Th>
                <Th className="hidden lg:table-cell">Reference</Th>
                <Th>Status</Th>
                <Th className="hidden xl:table-cell">Provider</Th>
                {canMutate ? <Th className="text-end">Action</Th> : null}
              </tr>
            </thead>
            <tbody>
              {result.body.rows.map((row) => (
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
        buildHref={(next) => `/admin/transactions?${toQuery(params, { page: String(next) })}`}
      />
    </div>
  );
}

function Row({ row, canMutate }: { row: AdminTransaction; canMutate: boolean }) {
  return (
    <tr className="border-b border-outline-variant last:border-b-0 hover:bg-surface-sunken/60">
      <td className="type-caption py-[var(--space-md)] pe-[var(--space-md)] ps-[var(--space-md)] text-text-secondary">
        {row.createdAt === null ? "—" : formatDate(row.createdAt)}
      </td>
      <td className="type-numeric py-[var(--space-md)] pe-[var(--space-md)] text-text">
        {formatMoney(row.amountCents, row.currency)}
      </td>
      <td className="py-[var(--space-md)] pe-[var(--space-md)]">
        {row.userId ? (
          <Link href={`/admin/users/${row.userId}`} className="type-label block truncate text-text hover:underline">
            {row.userEmail ?? row.userId}
          </Link>
        ) : (
          <p dir="auto" className="type-label text-text-secondary">{row.userEmail ?? "—"}</p>
        )}
        <p className="type-caption text-text-tertiary">
          {row.paidAt ? `Paid ${formatDateTime(row.paidAt)}` : "Not paid"}
          {row.refundedAt ? ` · Refunded ${formatDateTime(row.refundedAt)}` : ""}
        </p>
      </td>
      <td className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary md:table-cell">
        {row.planTitle ?? row.planCode ?? "—"}
        {row.billingInterval ? <span className="block text-text-tertiary">{formatEnum(row.billingInterval)}</span> : null}
      </td>
      <td className="hidden max-w-[220px] py-[var(--space-md)] pe-[var(--space-md)] lg:table-cell">
        <span className="type-numeric block truncate text-text-secondary" title={row.reference} dir="ltr">
          {row.reference}
        </span>
        {row.note ? <span dir="auto" className="type-caption block truncate text-text-tertiary">{row.note}</span> : null}
      </td>
      <td className="py-[var(--space-md)] pe-[var(--space-md)]">
        <Badge
          tone={
            row.status === "paid"
              ? "accent"
              : row.status === "pending"
                ? "neutral"
                : row.status === "refunded"
                  ? "muted"
                  : "danger"
          }
        >
          {formatEnum(row.status)}
        </Badge>
      </td>
      <td className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary xl:table-cell">
        {formatEnum(row.provider)}
      </td>
      {canMutate ? (
        <td className="py-[var(--space-md)] pe-[var(--space-md)] text-end">
          <TransactionActions reference={row.reference} status={row.status} canMutate={canMutate} />
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

function parseDate(value: string | undefined, endOfDay: boolean): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(`${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}Z`);
  return Number.isNaN(parsed) ? undefined : parsed;
}
