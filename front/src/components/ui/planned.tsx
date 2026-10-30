/**
 * A surface that exists in the navigation but not yet in the product.
 *
 * Every destination in the sidebar resolves, because a link that 404s teaches the
 * listener that the app is broken. What is *not* here is a fake version of the
 * screen — a table with invented rows, a button that does nothing. This says what
 * the screen will be and what it is waiting for.
 */

import { Card } from "@/components/ui/card";
import { Icon, type IconName } from "@/components/ui/icon";
import { PageHeader } from "@/components/ui/page-header";

export function PlannedSurface({
  overline,
  title,
  description,
  icon,
  items,
}: {
  overline: string;
  title: string;
  description: string;
  icon: IconName;
  items: readonly string[];
}) {
  return (
    <div className="flex flex-col gap-[var(--space-lg)]">
      <PageHeader overline={overline} title={title} description={description} />

      <Card className="p-[var(--space-xxl)]">
        <div className="flex items-start gap-[var(--space-md)]">
          <span className="grid size-12 shrink-0 place-items-center rounded-[var(--radius-md)] bg-surface-sunken text-text-tertiary">
            <Icon name={icon} size="lg" />
          </span>

          <div className="min-w-0">
            <p className="type-body-strong text-text">این بخش هنوز ساخته نشده است</p>
            <p className="type-caption mt-[var(--space-xs)] max-w-[58ch] text-text-tertiary">
              زیرساخت آن آماده است؛ صفحه در مرحلهٔ بعدی ساخت اضافه می‌شود.
            </p>

            <ul className="mt-[var(--space-md)] flex flex-col gap-[var(--space-xs)]">
              {items.map((item) => (
                <li key={item} className="type-caption flex items-start gap-[var(--space-sm)] text-text-secondary">
                  <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-accent" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Card>
    </div>
  );
}
