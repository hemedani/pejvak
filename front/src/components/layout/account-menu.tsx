"use client";

/**
 * The account menu.
 *
 * Sign-out is a **form posting a Server Action**, not a click handler calling
 * `fetch`. That is what makes it survive the "back" button: the action deletes
 * the cookie and redirects server-side, so the page behind the guard can no
 * longer be re-rendered from the history cache (plan §1.7).
 */

import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import Link from "next/link";

import { logout } from "@/app/actions/auth/logout";
import { Icon } from "@/components/ui/icon";
import { displayNameOf, initialOf, type CurrentUser } from "@/lib/domain/user";

export function AccountMenu({ user }: { user: CurrentUser }) {
  const name = displayNameOf(user);

  return (
    // A Radix primitive takes its direction from the provider on `Root`, not
    // from the content element — the arrow-key handling and the `dir` attribute
    // are decided there. It defaults to LTR, which is the app's direction, but it
    // is passed explicitly so the default is never the thing holding it up.
    <DropdownMenu.Root dir="ltr">
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          className="flex h-11 items-center gap-[var(--space-sm)] rounded-[var(--radius-md)] pe-[var(--space-md)] ps-[var(--space-xs)] text-text-secondary transition-colors hover:bg-surface-sunken hover:text-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]"
          aria-label={`Account: ${name}`}
        >
          <Avatar user={user} />
          <span className="type-label hidden max-w-[16ch] truncate sm:inline">{name}</span>
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={8}
          className="z-50 min-w-[14rem] rounded-[var(--radius-lg)] border border-[var(--glass-border)] bg-[var(--glass-strong)] p-[var(--space-xs)] shadow-[var(--elevation-panel)] backdrop-blur-[38px]"
        >
          <div className="px-[var(--space-md)] py-[var(--space-sm)]">
            <p className="type-label truncate text-text">{name}</p>
            <p className="type-caption truncate text-text-tertiary" dir="ltr">
              {user.email}
            </p>
          </div>

          <DropdownMenu.Separator className="my-[var(--space-xs)] h-px bg-[var(--outline-variant)]" />

          {/*
            The console is not a listener surface, so it is not in `NAV_ITEMS`:
            the sidebar is the same on every account. The entry lives here
            because this menu is the one place that already knows the role.
            Support and admin both enter; the pages and actions decide what
            they may do.
          */}
          {user.role !== "user" ? (
            <>
              <DropdownMenu.Item asChild>
                <Link
                  href="/admin"
                  className="flex w-full items-center gap-[var(--space-sm)] rounded-[var(--radius-sm)] px-[var(--space-md)] py-[var(--space-sm)] type-label text-text outline-none data-[highlighted]:bg-surface-sunken"
                >
                  <Icon name="overview" size="sm" />
                  Operator console
                  <span className="ms-auto type-caption text-text-tertiary">
                    {user.role === "admin" ? "Admin" : "Support"}
                  </span>
                </Link>
              </DropdownMenu.Item>
              <DropdownMenu.Separator className="my-[var(--space-xs)] h-px bg-[var(--outline-variant)]" />
            </>
          ) : null}

          <form action={logout}>
            <DropdownMenu.Item asChild>
              <button
                type="submit"
                className="flex w-full items-center gap-[var(--space-sm)] rounded-[var(--radius-sm)] px-[var(--space-md)] py-[var(--space-sm)] type-label text-danger outline-none data-[highlighted]:bg-danger-soft"
              >
                <Icon name="logout" size="sm" />
                Sign out
              </button>
            </DropdownMenu.Item>
          </form>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

function Avatar({ user }: { user: CurrentUser }) {
  if (user.avatarUrl) {
    return (
      // A remote avatar URL, not a Next/Image: the host is whatever the listener
      // saved, and `next/image` would need every one of those hosts allow-listed
      // in `next.config.ts` at build time.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={user.avatarUrl}
        alt=""
        width={32}
        height={32}
        className="size-8 rounded-full object-cover"
      />
    );
  }

  return (
    <span
      aria-hidden
      className="grid size-8 place-items-center rounded-full bg-accent-soft type-label text-accent"
    >
      {initialOf(user)}
    </span>
  );
}
