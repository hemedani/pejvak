"use client";

/**
 * The last line of defence for a render that threw.
 *
 * Next 16's `error.tsx` receives `retry` (it used to be `reset`): calling it
 * re-renders the segment inside a transition, which is what a "try again" button
 * has to do — a `router.refresh()` would drop the client state the listener had
 * on the page.
 *
 * The raw message is not shown. A Persian UI with `TypeError: Cannot read
 * properties of undefined` in it tells the listener nothing and tells them the
 * app is broken; the digest is what support needs, and it is kept.
 */

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export function RouteError({
  error,
  retry,
  scope,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  scope: string;
}) {
  useEffect(() => {
    // One line, with the digest, so a server log and this report can be matched.
    console.error(`[${scope}]`, error.digest ?? "", error.message);
  }, [error, scope]);

  return (
    <div className="flex flex-col items-start gap-[var(--space-md)] py-[var(--space-giant)]" role="alert">
      <span className="grid size-12 place-items-center rounded-[var(--radius-md)] bg-danger-soft text-danger">
        <Icon name="error" size="lg" />
      </span>

      <div className="max-w-[52ch]">
        <p className="type-body-strong text-text">این صفحه نمایش داده نشد</p>
        <p className="type-caption text-text-tertiary mt-[var(--space-xs)]">
          خطایی در ساخت صفحه رخ داد. اگر تکرار شد، شناسهٔ زیر را گزارش کنید.
        </p>
        {error.digest ? (
          <p className="type-numeric mt-[var(--space-sm)] text-text-tertiary" dir="ltr">
            {error.digest}
          </p>
        ) : null}
      </div>

      <Button type="button" variant="secondary" size="md" onClick={() => retry()}>
        تلاش دوباره
      </Button>
    </div>
  );
}
