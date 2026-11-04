"use client";

/**
 * One mutation, awaited.
 *
 * There is no optimistic path here on purpose: a role change, a refund or a
 * delete is not a speed slider. The hook keeps the three things every admin
 * form needs — a pending flag, a failure sentence, a success sentence — and
 * refreshes the server component only after the act returned success.
 */

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { failureMessage } from "@/lib/messages";
import type { ActResult } from "@/lib/result";

export function useAdminAction() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  function run<T>(
    action: () => Promise<ActResult<T>>,
    onSuccess?: (body: T) => void,
    options: { refresh?: boolean } = {},
  ): void {
    setError(null);
    setMessage(null);

    startTransition(async () => {
      const result = await action();

      if (!result.success) {
        setError(failureMessage(result.error));
        return;
      }

      onSuccess?.(result.body);
      if (options.refresh !== false) {
        router.refresh();
      }
    });
  }

  return { pending, error, message, setError, setMessage, run };
}

export function MutationMessage({
  error,
  message,
}: {
  error: string | null;
  message: string | null;
}) {
  if (!error && !message) {
    return null;
  }

  return (
    <div
      role={error ? "alert" : "status"}
      className={
        error
          ? "flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-danger-soft px-[var(--space-md)] py-[var(--space-sm)] text-danger"
          : "flex items-start gap-[var(--space-sm)] rounded-[var(--radius-md)] bg-accent-soft px-[var(--space-md)] py-[var(--space-sm)] text-accent"
      }
    >
      <p className="type-caption">{error ?? message}</p>
    </div>
  );
}
