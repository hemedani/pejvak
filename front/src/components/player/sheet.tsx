"use client";

/**
 * The player's floating surface.
 *
 * Glass is for what floats over content — sheets, the dock — never for a card
 * that is read (`AGENTS.md`, two materials). The panel is a bottom sheet on a
 * narrow viewport and a centred panel above it; both are the same DOM so focus
 * restoration and the dialog description behave identically.
 *
 * ## The geometry, and the bug it replaces
 *
 * This panel used to be placed with `start-1/2` and `translate-x-1/2`. Those two
 * do not centre anything: `start-1/2` puts the left edge at the middle of the
 * window and the *positive* translate then pushes the panel a further half of
 * its own width to the right, so its left edge lands a whole panel-width past
 * centre and its right edge sits exactly on the window edge. On a 1440px screen
 * a 30rem panel appeared at x = 960, flush against the right — which is why
 * every one of these dialogs read as a drawer that had forgotten to be a drawer.
 *
 * Centring is `inset-x-0` plus `mx-auto` now. There is no transform to get the
 * sign wrong on, and the vertical half of the trick is the only one left, where
 * `translate-y-1/2` under `bottom: calc(50% + clearance / 2)` is checkable by
 * hand: with `bottom: B` and a half-height translate, the panel's centre sits at
 * distance `B` from the window bottom, so `B` has to be the centre of the free
 * area — which is `50% + clearance / 2`, not `50% - …`.
 *
 * ## It sits on the dock, not over it
 *
 * `--sheet-clearance` (globals.css) is the dock's measured height plus one space
 * step, so the panel's bottom edge clears the dock's top edge. A dialog that
 * covers the dock takes away the one control the listener still wants while
 * reading a session's timeline. When no track is playing the clearance collapses
 * to a single space step and the panel simply floats above the window edge.
 *
 * The motion follows from the same idea: the panel rises one space step from
 * the direction of the dock, and the scrim is what separates it from the page.
 */

import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  className?: string;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:animate-[fade-in_var(--motion-fast)_ease-out] data-[state=closed]:animate-[fade-out_var(--motion-fast)_ease-in]" />
        <Dialog.Content
          dir="ltr"
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden",
            // Inset on a phone so the panel lines up with the dock's own edges,
            // and anchored to the space above it rather than to the window.
            "inset-x-[var(--space-md)] bottom-[var(--sheet-clearance)]",
            "max-h-[calc(100dvh_-_var(--sheet-clearance)_-_var(--space-xxl))]",
            "rounded-[var(--radius-xl)]",
            // The same slab as the dock. A dialog and the player are both
            // floating objects; two materials for them would be two ideas.
            "glass-sheet",
            "data-[state=open]:animate-[sheet-up_var(--motion-base)_var(--ease-out)] data-[state=closed]:animate-[sheet-down_var(--motion-fast)_var(--ease-in)]",
            // A wide screen centres it in the free area. `mx-auto` does the
            // horizontal work. Vertically: with `bottom: B` and a half-height
            // translate, the panel's *centre* sits at distance `B` from the
            // window bottom — so `B` is the centre of the free area, which is
            // `50% + clearance/2` from the bottom and not `50% - …`. The minus
            // is the same sign trap that produced the right-edge bug above.
            "sm:inset-x-0 sm:mx-auto sm:w-[min(var(--layout-sheet),calc(100vw_-_var(--space-xxl)))]",
            "sm:bottom-[calc(50%_+_var(--sheet-clearance)/2)] sm:translate-y-1/2",
            className,
          )}
        >
          <header className="flex items-start justify-between gap-[var(--space-md)] px-[var(--space-lg)] pb-[var(--space-md)] pt-[var(--space-lg)]">
            <div className="min-w-0">
              <Dialog.Title dir="auto" className="type-heading line-clamp-2 text-text" title={title}>
                {title}
              </Dialog.Title>
              {description ? (
                <Dialog.Description className="type-caption mt-[var(--space-xs)] text-text-secondary">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close" className="-me-[var(--space-xs)] -mt-[var(--space-xs)]">
                <Icon name="close" size="md" />
              </Button>
            </Dialog.Close>
          </header>

          {/* `overscroll-contain`: a sheet is a place, not a hole in the page —
              reaching its end must not start scrolling the list behind it. */}
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto overscroll-contain px-[var(--space-lg)] pb-[var(--space-lg)]">
            {children}
          </div>

          {footer ? (
            <footer className="border-t border-[var(--glass-border)] px-[var(--space-lg)] py-[var(--space-md)]">
              {footer}
            </footer>
          ) : null}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
