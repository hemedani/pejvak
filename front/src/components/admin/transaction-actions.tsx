"use client";

/**
 * Confirm a pending payment, or refund a paid one.
 *
 * `alreadyProcessed: true` is a duplicate click, not an error — the act is
 * idempotent and the panel says so. A refund takes the reference typed out,
 * because it revokes the account's **current** access as well as marking the
 * ledger.
 */

import { useState } from "react";

import { adminConfirmTransaction } from "@/app/actions/admin/transactions/confirm-transaction";
import { adminRefundTransaction } from "@/app/actions/admin/transactions/refund-transaction";
import { Button } from "@/components/ui/button";
import { fieldTrackClass } from "@/components/ui/text-field";
import { MutationMessage, useAdminAction } from "@/components/admin/use-admin-action";

export function TransactionActions({
  reference,
  status,
  canMutate,
}: {
  reference: string;
  status: string;
  canMutate: boolean;
}) {
  const { pending, error, message, setError, setMessage, run } = useAdminAction();
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState("");
  const [reason, setReason] = useState("");

  if (!canMutate) {
    return null;
  }

  if (status === "pending") {
    return (
      <details className="min-w-[220px]">
        <summary className="type-caption cursor-pointer select-none text-accent">Confirm…</summary>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () =>
                adminConfirmTransaction({
                  reference,
                  ...(note.trim() ? { note: note.trim() } : {}),
                }),
              (result) => {
                setNote("");
                setMessage(
                  result.alreadyProcessed
                    ? "This payment was already processed; nothing was extended twice."
                    : `Payment confirmed (${result.status ?? "paid"}).`,
                );
              },
            );
          }}
          className="mt-[var(--space-sm)] flex flex-col gap-[var(--space-sm)]"
        >
          <input
            value={note}
            onChange={(event) => setNote(event.target.value)}
            disabled={pending}
            placeholder="Note (optional)"
            className={fieldTrackClass}
            aria-label="Confirmation note"
          />
          <Button type="submit" variant="primary" size="sm" disabled={pending}>
            Mark received
          </Button>
          <MutationMessage error={error} message={message} />
        </form>
      </details>
    );
  }

  if (status !== "paid") {
    return null;
  }

  return (
    <details className="min-w-[240px]">
      <summary className="type-caption cursor-pointer select-none text-danger">Refund…</summary>
      <form
        onSubmit={(event) => {
          event.preventDefault();

          if (confirm.trim() !== reference) {
            setError(`Type ${reference} to confirm.`);
            return;
          }

          run(
            () =>
              adminRefundTransaction({
                reference,
                ...(reason.trim() ? { reason: reason.trim() } : {}),
              }),
            () => {
              setConfirm("");
              setReason("");
              setMessage("Refunded. Current access was revoked.");
            },
          );
        }}
        className="mt-[var(--space-sm)] flex flex-col gap-[var(--space-sm)]"
      >
        <p className="type-caption text-text-tertiary">
          This marks the ledger refunded and revokes current access. Type{" "}
          <span className="type-numeric break-all text-text">{reference}</span> to confirm.
        </p>
        <input
          value={confirm}
          onChange={(event) => setConfirm(event.target.value)}
          disabled={pending}
          className={fieldTrackClass}
          aria-label={`Type ${reference} to confirm`}
        />
        <input
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          disabled={pending}
          placeholder="Reason (optional)"
          className={fieldTrackClass}
          aria-label="Refund reason"
        />
        <Button type="submit" variant="danger" size="sm" disabled={pending}>
          Refund
        </Button>
        <MutationMessage error={error} message={message} />
      </form>
    </details>
  );
}
