/**
 * One figure on the overview.
 *
 * A label, a value and an optional note. The note exists so a number that needs
 * a qualification can carry it — `usersAtLimit` counts every account at or above
 * the free cap, not only free accounts, and that belongs beside the figure rather
 * than in a footnote nobody reads.
 */

import { Card } from "@/components/ui/card";
import { cn } from "@/lib/cn";

export function StatCard({
  label,
  value,
  note,
  className,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  className?: string;
}) {
  return (
    <Card className={cn("p-[var(--space-lg)]", className)}>
      <p className="type-overline text-text-tertiary">{label}</p>
      <p className="type-title mt-[var(--space-xs)] text-text">{value}</p>
      {note ? <p className="type-caption mt-[var(--space-xs)] text-text-tertiary">{note}</p> : null}
    </Card>
  );
}
