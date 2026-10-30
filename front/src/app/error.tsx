"use client";

import { RouteError } from "@/components/ui/route-error";

/** The root fallback — for a throw outside the shell (a broken layout, a bad theme). */
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <main className="mx-auto w-full max-w-[640px] px-[var(--space-lg)]">
      <RouteError error={error} retry={retry} scope="root" />
    </main>
  );
}
