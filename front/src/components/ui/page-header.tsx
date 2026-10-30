/**
 * The heading every screen opens with.
 *
 * Overline → title → description, in that order and with that type ramp. A page
 * that writes its own header eventually uses a different size than its
 * neighbour, and two screens that disagree by 2px read as two products.
 */

import { cn } from "@/lib/cn";

export function PageHeader({
  overline,
  title,
  description,
  actions,
  className,
}: {
  overline?: string;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-end justify-between gap-[var(--space-md)]", className)}>
      <div className="min-w-0">
        {overline ? (
          <p className="type-overline mb-[var(--space-xs)] text-text-tertiary">{overline}</p>
        ) : null}
        <h1 className="type-title text-text">{title}</h1>
        {description ? (
          <p className="type-caption mt-[var(--space-xs)] max-w-[60ch] text-text-tertiary">
            {description}
          </p>
        ) : null}
      </div>

      {actions ? <div className="flex shrink-0 items-center gap-[var(--space-sm)]">{actions}</div> : null}
    </div>
  );
}
