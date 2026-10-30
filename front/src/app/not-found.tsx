import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-[var(--space-lg)]">
      <div className="flex max-w-[44ch] flex-col items-center gap-[var(--space-md)] text-center">
        <span className="grid size-14 place-items-center rounded-[var(--radius-lg)] bg-surface-sunken text-text-tertiary">
          <Icon name="search" size="xl" />
        </span>
        <h1 className="type-heading text-text">این صفحه پیدا نشد</h1>
        <p className="type-caption text-text-tertiary">
          نشانی ممکن است تغییر کرده باشد، یا موردی که دنبالش بودید حذف شده باشد.
        </p>
        <Button asChild variant="primary" size="md">
          <Link href="/">بازگشت به خانه</Link>
        </Button>
      </div>
    </main>
  );
}
