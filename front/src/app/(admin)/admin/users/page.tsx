import Link from "next/link";
import { Suspense } from "react";

import { adminListUsers } from "@/app/actions/admin/users/list-users";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/ui/state";
import { fieldTrackClass } from "@/components/ui/text-field";
import type { AdminUser } from "@/lib/admin/domain/users";
import { formatRole, formatStatus } from "@/lib/admin/format";
import { pageParam, firstParam } from "@/lib/search-params";
import { toQuery, type RawSearchParams } from "@/lib/admin/url";
import { formatDate } from "@/lib/time";
import type { AdminUserQuery } from "@/lib/admin/query";


export default async function AdminUsersPage({
  searchParams,
}: {
  searchParams: Promise<RawSearchParams>;
}) {
  const params = await searchParams;
  const page = pageParam(params.page);

  const query: AdminUserQuery = {
    page,
    role: firstParam(params.role) as AdminUserQuery["role"],
    status: firstParam(params.status) as AdminUserQuery["status"],
    planCode: firstParam(params.planCode),
    search: firstParam(params.search),
    sortBy: firstParam(params.sortBy),
    sortOrder: firstParam(params.sortOrder) === "asc" ? "asc" : "desc",
  };

  return (
    <div className="flex flex-col gap-[var(--space-xl)]">
      <PageHeader
        overline="Operator console"
        title="Users"
        description="Every account, with the plan hint the list resolves from its latest subscription."
      />

      <UserFilters params={params} />

      <Suspense fallback={<TableSkeleton rows={10} />}>
        <UsersTable query={query} params={params} page={page} />
      </Suspense>
    </div>
  );
}

async function UsersTable({
  query,
  params,
  page,
}: {
  query: AdminUserQuery;
  params: RawSearchParams;
  page: number;
}) {
  const result = await adminListUsers(query);

  if (!result.success) {
    return <ErrorState failure={result.error} retryHref={`/admin/users?${toQuery(params)}`} />;
  }

  if (result.body.rows.length === 0) {
    return (
      <Card>
        <EmptyState
          icon="users"
          title="No accounts match"
          description="Clear a filter or search for a different email, username or display name."
          action={{ label: "Clear filters", href: "/admin/users" }}
        />
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-[var(--space-md)]">
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-outline-variant bg-surface shadow-[var(--elevation-card)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">Accounts</caption>
            <thead>
              <tr className="border-b border-outline-variant">
                <SortHeader field="email" label="Email" params={params} />
                <SortHeader field="username" label="Username" params={params} className="hidden md:table-cell" />
                <SortHeader field="displayName" label="Display name" params={params} className="hidden lg:table-cell" />
                <Th>Role</Th>
                <Th>Status</Th>
                <Th className="hidden sm:table-cell">Plan hint</Th>
                <SortHeader field="createdAt" label="Created" params={params} className="hidden xl:table-cell" />
              </tr>
            </thead>
            <tbody>
              {result.body.rows.map((user) => (
                <UserRow key={user.id} user={user} />
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <AdminPagination
        page={result.body.page || page}
        total={result.body.total}
        limit={result.body.limit || 25}
        buildHref={(next) => `/admin/users?${toQuery(params, { page: String(next) })}`}
      />
    </div>
  );
}

function UserRow({ user }: { user: AdminUser }) {
  return (
    <tr className="border-b border-outline-variant last:border-b-0 hover:bg-surface-sunken/60">
      <td className="py-[var(--space-md)] pe-[var(--space-md)] ps-[var(--space-md)]">
        <Link dir="auto" href={`/admin/users/${user.id}`} className="type-label block truncate text-text hover:underline">
          {user.email || "No email"}
        </Link>
        <p dir="auto" className="type-caption truncate text-text-tertiary md:hidden">{user.username || "—"}</p>
      </td>
      <td dir="auto" className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary md:table-cell">
        {user.username || "—"}
      </td>
      <td dir="auto" className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary lg:table-cell">
        {user.displayName ?? "—"}
      </td>
      <td className="py-[var(--space-md)] pe-[var(--space-md)]">
        <Badge tone={user.role === "admin" ? "accent" : "neutral"}>{formatRole(user.role)}</Badge>
      </td>
      <td className="py-[var(--space-md)] pe-[var(--space-md)]">
        <span title={user.status === "suspended" ? user.suspendedReason ?? undefined : undefined}>
          <Badge tone={user.status === "active" ? "neutral" : user.status === "suspended" ? "danger" : "muted"}>
            {formatStatus(user.status)}
          </Badge>
        </span>
      </td>
      <td className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-secondary sm:table-cell">
        <span className="type-label text-text">{user.planCode ?? "Free"}</span>
        {user.subscription ? (
          <span className="ms-[var(--space-xs)] text-text-tertiary">{user.subscription.status}</span>
        ) : null}
      </td>
      <td className="type-caption hidden py-[var(--space-md)] pe-[var(--space-md)] text-text-tertiary xl:table-cell">
        {user.createdAt === null ? "—" : formatDate(user.createdAt)}
      </td>
    </tr>
  );
}

function UserFilters({ params }: { params: RawSearchParams }) {
  return (
    <Card className="p-[var(--space-lg)]">
      <form method="get" className="grid gap-[var(--space-md)] md:grid-cols-2 xl:grid-cols-12">
        <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-4">
          <span className="type-label text-text">Search</span>
          <input
            name="search"
            defaultValue={firstParam(params.search) ?? ""}
            placeholder="Email, username or display name"
            className={fieldTrackClass}
          />
        </label>

        <SelectField name="role" label="Role" defaultValue={firstParam(params.role) ?? ""} className="xl:col-span-2">
          <option value="">Any role</option>
          <option value="user">Listener</option>
          <option value="support">Support</option>
          <option value="admin">Admin</option>
        </SelectField>

        <SelectField name="status" label="Status" defaultValue={firstParam(params.status) ?? ""} className="xl:col-span-2">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="deleted">Deleted</option>
        </SelectField>

        <label className="flex flex-col gap-[var(--space-xs)] xl:col-span-2">
          <span className="type-label text-text">Plan code</span>
          <input
            name="planCode"
            defaultValue={firstParam(params.planCode) ?? ""}
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
            <Link href="/admin/users">Clear</Link>
          </Button>
        </div>

        <input type="hidden" name="sortBy" value={firstParam(params.sortBy) ?? "createdAt"} />
        <input type="hidden" name="sortOrder" value={firstParam(params.sortOrder) ?? "desc"} />
      </form>
    </Card>
  );
}

function SelectField({
  name,
  label,
  defaultValue,
  className,
  children,
}: {
  name: string;
  label: string;
  defaultValue: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`flex flex-col gap-[var(--space-xs)] ${className ?? ""}`}>
      <span className="type-label text-text">{label}</span>
      <select name={name} defaultValue={defaultValue} className={fieldTrackClass}>
        {children}
      </select>
    </label>
  );
}

function SortHeader({
  field,
  label,
  params,
  className,
}: {
  field: string;
  label: string;
  params: RawSearchParams;
  className?: string;
}) {
  const current = firstParam(params.sortBy) ?? "createdAt";
  const order = firstParam(params.sortOrder) === "asc" ? "asc" : "desc";
  const nextOrder = current === field && order === "desc" ? "asc" : "desc";
  const active = current === field;

  return (
    <th
      scope="col"
      className={`type-caption px-[var(--space-md)] py-[var(--space-sm)] font-semibold text-text-tertiary ${
        className ?? ""
      }`}
    >
      <Link
        href={`/admin/users?${toQuery(params, { sortBy: field, sortOrder: nextOrder, page: "1" })}`}
        className="inline-flex items-center gap-[2px] hover:text-text"
      >
        {label}
        <Icon name={active && order === "asc" ? "up" : "down"} size="xs" className={active ? "text-accent" : "opacity-0"} />
      </Link>
    </th>
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

