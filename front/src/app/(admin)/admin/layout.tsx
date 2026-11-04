import Link from "next/link";
import { redirect, notFound } from "next/navigation";

import { getMe } from "@/app/actions/auth/get-me";
import { AdminNav } from "@/components/admin/admin-nav";
import { AccountMenu } from "@/components/layout/account-menu";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Icon } from "@/components/ui/icon";
import { ErrorState } from "@/components/ui/state";
import { isOperatorRole } from "@/lib/admin/roles";

/**
 * The admin gate.
 *
 * - No session → `/login`, exactly as the listener shell does.
 * - Backend/offline failure → an error state, not a redirect. A timeout must not
 *   look like being signed out.
 * - `role: "user"` (legacy included) → `notFound()`. A listener must not learn
 *   that `/admin` exists.
 *
 * `proxy.ts` still only checks the cookie. This is the real gate, and every
 * action re-checks independently because a Server Action is a POST to its own
 * route and can be invoked directly.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const result = await getMe();

  if (!result.success) {
    if (result.error.kind === "unauthorized") {
      redirect("/login");
    }

    return (
      <main className="mx-auto flex min-h-dvh max-w-[52ch] items-center px-[var(--space-lg)]">
        <ErrorState failure={result.error} className="w-full" />
      </main>
    );
  }

  if (!isOperatorRole(result.body.role)) {
    notFound();
  }

  const roleLabel = result.body.role === "admin" ? "Admin" : "Support";

  return (
    <div className="flex min-h-dvh">
      <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col gap-[var(--space-xl)] border-e border-outline-variant bg-canvas-elevated px-[var(--space-md)] py-[var(--space-xl)] lg:flex">
        <Link href="/admin" className="flex items-center gap-[var(--space-sm)] px-[var(--space-sm)] text-text">
          <BrandMark />
          <span className="type-heading">Pejvak</span>
        </Link>

        <div className="flex items-center gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-surface-sunken px-[var(--space-md)] py-[var(--space-sm)]">
          <Icon name="support" size="sm" className="text-text-tertiary" />
          <p className="type-caption text-text-secondary">{roleLabel} console</p>
        </div>

        <AdminNav />

        <Link
          href="/"
          className="mt-auto flex h-11 items-center gap-[var(--space-md)] rounded-[var(--radius-md)] px-[var(--space-md)] type-label text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text"
        >
          <Icon name="start" size="sm" />
          Back to console
        </Link>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 bg-canvas/85 backdrop-blur-[22px] lg:bg-transparent lg:backdrop-blur-none">
          <div className="flex h-16 items-center justify-between gap-[var(--space-md)] px-[var(--space-lg)] lg:px-[var(--space-xxl)]">
            <Link href="/admin" className="flex items-center gap-[var(--space-sm)] text-text lg:hidden">
              <span className="type-heading">Pejvak Admin</span>
            </Link>

            <div className="ms-auto flex items-center gap-[var(--space-xs)]">
              <ThemeToggle />
              <AccountMenu user={result.body} />
            </div>
          </div>

          <div className="px-[var(--space-lg)] lg:hidden">
            <AdminNav orientation="strip" />
          </div>
        </header>

        <main className="mx-auto w-full max-w-[1180px] flex-1 px-[var(--space-lg)] pb-[var(--space-giant)] pt-[var(--space-md)] lg:px-[var(--space-xxl)]">
          {children}
        </main>
      </div>
    </div>
  );
}

function BrandMark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden fill="none">
      <circle cx="13" cy="13" r="4" fill="var(--accent)" />
      <path
        d="M6.4 6.4a9.3 9.3 0 0 0 0 13.2M19.6 6.4a9.3 9.3 0 0 1 0 13.2"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.55"
      />
    </svg>
  );
}
