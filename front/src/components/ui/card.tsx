/**
 * The content surface.
 *
 * Opaque, always (plan §7.1). Glass is reserved for what *floats* — the player
 * bar, sheets, menus — because a frosted card on this canvas measured 1.04:1
 * against its own hairline on mobile: the text stayed legible and the card
 * stopped being a shape.
 *
 * There is one radius (`--radius-card`) and one padding (`--space-lg`), so two
 * cards side by side start their content at the same place.
 */

import type { ComponentProps } from "react";

import { cn } from "@/lib/cn";

export function Card({ className, ...rest }: ComponentProps<"section">) {
  return (
    <section
      {...rest}
      className={cn(
        "rounded-[var(--radius-card)] bg-surface text-text",
        "border border-outline-variant shadow-[var(--elevation-card)]",
        className,
      )}
    />
  );
}

/**
 * A card's heading block: an eyebrow and a title.
 *
 * `overline` above `heading` rather than beside it — a Persian label set to the
 * left of a title competes with it for the same line, and in RTL "left" is the
 * reading edge.
 */
export function CardHeading({
  overline,
  title,
  action,
  className,
}: {
  overline?: string;
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start justify-between gap-[var(--space-md)]", className)}>
      <div className="min-w-0">
        {overline ? (
          <p className="type-overline text-text-tertiary mb-[var(--space-xs)]">{overline}</p>
        ) : null}
        <h2 className="type-heading text-text truncate">{title}</h2>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}
