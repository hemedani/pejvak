"use client";

/**
 * Revoke one subscription, from its row.
 *
 * The confirmation is the plan code, typed — a checkbox is not a confirmation.
 * The act ends access immediately; the row survives so the audit trail can still
 * explain why.
 */

import { useState } from "react";

import { adminRevokeSubscription } from "@/app/actions/admin/subscriptions/revoke-subscription";
import { Button } from "@/components/ui/button";
import { fieldTrackClass } from "@/components/ui/text-field";
import { MutationMessage, useAdminAction } from "@/components/admin/use-admin-action";

export function SubscriptionRevoke({
  userId,
  planCode,
}: {
  userId: string;
  planCode: string;
}) {
  const { pending, error, message, setError, setMessage, run } = useAdminAction();
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();

    if (confirm.trim().toLowerCase() !== planCode.toLowerCase()) {
      setError(`Type ${planCode} to confirm.`);
      return;
    }

    run(
      () =>
        adminRevokeSubscription({
          userId,
          ...(reason.trim() ? { reason: reason.trim() } : {}),
        }),
      () => {
        setConfirm("");
        setReason("");
        setMessage("Access revoked now.");
      },
    );
  }

  return (
    <details className="min-w-[220px]">
      <summary className="type-caption cursor-pointer select-none text-danger">Revoke…</summary>
      <form onSubmit={submit} className="mt-[var(--space-sm)] flex flex-col gap-[var(--space-sm)]">
        <p className="type-caption text-text-tertiary">
          Access ends now. Type <span className="type-numeric text-text">{planCode}</span> to confirm.
        </p>
        <input
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={pending}
          className={fieldTrackClass}
          aria-label={`Type ${planCode} to confirm`}
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={pending}
          placeholder="Reason (optional)"
          className={fieldTrackClass}
          aria-label="Revoke reason"
        />
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          Revoke now
        </Button>
        <MutationMessage error={error} message={message} />
      </form>
    </details>
  );
}
