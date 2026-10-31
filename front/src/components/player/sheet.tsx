"use client";

/**
 * The player's floating surface.
 *
 * Glass is for what floats over content — sheets, the bar — never for a card
 * that is read (`AGENTS.md`, two materials). The panel is a bottom sheet on a
 * narrow viewport and a centred panel above it; both are the same DOM so focus
 * restoration and the dialog description behave identically.
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
        <Dialog.Overlay className="fixed inset-0 z-40 bg-[var(--scrim)] data-[state=open]:animate-[fade-in_160ms_ease-out]" />
        <Dialog.Content
          dir="rtl"
          className={cn(
            "fixed inset-x-0 bottom-0 z-50 flex max-h-[85dvh] flex-col",
            "rounded-t-[var(--radius-xl)] border border-[var(--glass-border)]",
            "bg-[var(--glass)] backdrop-blur-xl",
            "shadow-[var(--elevation-float)]",
            "data-[state=open]:animate-[sheet-up_200ms_cubic-bezier(0.22,1,0.36,1)]",
            "sm:inset-x-auto sm:bottom-1/2 sm:start-1/2 sm:w-[min(30rem,calc(100vw-2rem))]",
            "sm:translate-x-1/2 sm:translate-y-1/2 sm:rounded-[var(--radius-xl)]",
            className,
          )}
        >
          <header className="flex items-start justify-between gap-[var(--space-md)] px-[var(--space-lg)] pb-[var(--space-md)] pt-[var(--space-lg)]">
            <div className="min-w-0">
              <Dialog.Title className="type-heading text-text">{title}</Dialog.Title>
              {description ? (
                <Dialog.Description className="type-caption mt-[var(--space-xs)] text-text-secondary">
                  {description}
                </Dialog.Description>
              ) : null}
            </div>
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="بستن" className="-me-[var(--space-xs)] -mt-[var(--space-xs)]">
                <Icon name="close" size="md" />
              </Button>
            </Dialog.Close>
          </header>

          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-[var(--space-lg)] pb-[var(--space-lg)]">
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
