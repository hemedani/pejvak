/**
 * One number on the dashboard.
 *
 * The card exists to show the figure, so the figure is the label. It owns the
 * loudest tier — `type-figure` in `text` — while the caption above it steps
 * back to `text-text-secondary` and the detail below to `text-text-tertiary`. That is plan
 * §7.2's tier table applied to a card whose subject is the number rather than
 * to a row whose subject is its label: reading it the other way round makes the
 * eye land on "Total listening time" and then go looking for the value it
 * introduced.
 *
 * Tabular figures are not cosmetic: a stat that ticks upward would otherwise
 * change width on every update and shuffle everything beside it.
 */

import { Icon, type IconName } from "@/components/ui/icon";
import { cn } from "@/lib/cn";

export function StatCell({
  label,
  value,
  detail,
  icon,
  className,
}: {
  label: string;
  value: string;
  detail?: string;
  icon?: IconName;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-[var(--space-sm)] rounded-[var(--radius-card)]",
        "border border-outline-variant bg-surface p-[var(--space-xl)]",
        "shadow-[var(--elevation-card)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-[var(--space-sm)]">
        <p className="type-caption text-text-secondary">{label}</p>
        {icon ? <Icon name={icon} size="sm" className="text-text-tertiary" /> : null}
      </div>

      {/* `type-figure` carries `font-variant-numeric: tabular-nums`. */}
      <p className="type-figure text-text">{value}</p>

      {detail ? <p className="type-caption text-text-tertiary">{detail}</p> : null}
    </div>
  );
}
