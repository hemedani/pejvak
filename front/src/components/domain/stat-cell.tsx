/**
 * One number on the dashboard.
 *
 * The three content tiers, in order and never inverted (plan §7.2):
 * label in `text`, value in `textSecondary` with tabular figures, detail in
 * `textTertiary`. A 13px grey label beside a 16px bold value — the inversion —
 * reads as mush no matter how good the palette is.
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
        "border border-outline-variant bg-surface p-[var(--space-lg)]",
        "shadow-[var(--elevation-card)]",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-[var(--space-sm)]">
        <p className="type-caption text-text">{label}</p>
        {icon ? <Icon name={icon} size="sm" className="text-text-tertiary" /> : null}
      </div>

      {/* `type-figure` carries `font-variant-numeric: tabular-nums`. */}
      <p className="type-figure text-text-secondary">{value}</p>

      {detail ? <p className="type-caption text-text-tertiary">{detail}</p> : null}
    </div>
  );
}
