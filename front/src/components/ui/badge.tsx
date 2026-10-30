/**
 * A chip is a filter; a segmented control is a choice (plan §7.6).
 *
 * This is the chip. It reports a property of a row — a track's origin, a
 * session's verdict — and it is never clickable. The moment it takes a click it
 * becomes a filter, and a filter belongs in `FilterChip`, not here.
 */

import { cva, type VariantProps } from "class-variance-authority";
import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

const badge = cva(
  "inline-flex items-center gap-[var(--space-xs)] rounded-[var(--radius-pill)] type-caption whitespace-nowrap",
  {
    variants: {
      tone: {
        neutral: "bg-surface-sunken text-text-secondary",
        accent: "bg-accent-soft text-accent",
        danger: "bg-danger-soft text-danger",
        /** A row that is not an error and not a feature — just not here. */
        muted: "bg-transparent text-text-tertiary border border-outline-variant",
      },
      size: {
        sm: "h-6 px-[var(--space-sm)]",
        md: "h-7 px-[var(--space-md)]",
      },
    },
    defaultVariants: { tone: "neutral", size: "sm" },
  },
);

type BadgeProps = ComponentProps<"span"> & VariantProps<typeof badge>;

export function Badge({ className, tone, size, ...rest }: BadgeProps) {
  return <span {...rest} className={cn(badge({ tone, size }), className)} />;
}
