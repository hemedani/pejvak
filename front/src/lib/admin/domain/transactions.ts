/**
 * The ledger.
 *
 * A transaction is identified by `reference`, not `_id`: that is the string an
 * operator reads out of a bank statement, and it is what the confirm and refund
 * acts take. The owner is an email snapshot rather than a relation, so a row
 * still means something after the account is gone.
 */

import { asBoolean, asNumber, asRecord, asString, asTimestamp } from "@/lib/parse";

export type TransactionStatus =
  | "pending"
  | "paid"
  | "failed"
  | "canceled"
  | "refunded";

export type AdminTransaction = {
  id: string;
  reference: string;
  userId: string | null;
  userEmail: string | null;
  planCode: string | null;
  planTitle: string | null;
  amountCents: number;
  currency: string;
  billingInterval: string | null;
  status: TransactionStatus;
  provider: string;
  providerRef: string | null;
  periodStart: number | null;
  periodEnd: number | null;
  note: string | null;
  paidAt: number | null;
  refundedAt: number | null;
  createdAt: number | null;
};

export const TRANSACTION_GET = {
  _id: 1,
  reference: 1,
  userId: 1,
  userEmail: 1,
  planCode: 1,
  planTitle: 1,
  amountCents: 1,
  currency: 1,
  billingInterval: 1,
  status: 1,
  provider: 1,
  providerRef: 1,
  periodStart: 1,
  periodEnd: 1,
  note: 1,
  paidAt: 1,
  refundedAt: 1,
  createdAt: 1,
} as const;

function asStatus(value: unknown): TransactionStatus {
  switch (value) {
    case "paid":
    case "failed":
    case "canceled":
    case "refunded":
      return value;
    default:
      return "pending";
  }
}

export function parseTransaction(raw: unknown): AdminTransaction | null {
  const record = asRecord(raw);
  const id = asString(record?._id);
  const reference = asString(record?.reference);

  if (!record || !id || !reference) {
    return null;
  }

  return {
    id,
    reference,
    userId: asString(record.userId),
    userEmail: asString(record.userEmail),
    planCode: asString(record.planCode),
    planTitle: asString(record.planTitle),
    amountCents: asNumber(record.amountCents) ?? 0,
    currency: asString(record.currency) ?? "USD",
    billingInterval: asString(record.billingInterval),
    status: asStatus(record.status),
    provider: asString(record.provider) ?? "unknown",
    providerRef: asString(record.providerRef),
    periodStart: asTimestamp(record.periodStart),
    periodEnd: asTimestamp(record.periodEnd),
    note: asString(record.note),
    paidAt: asTimestamp(record.paidAt),
    refundedAt: asTimestamp(record.refundedAt),
    createdAt: asTimestamp(record.createdAt),
  };
}

export type ConfirmResult = {
  reference: string;
  status: string | null;
  alreadyProcessed: boolean;
};

export function parseConfirmResult(raw: unknown): ConfirmResult | null {
  const record = asRecord(raw);
  const reference = asString(record?.reference);

  if (!record || !reference) {
    return null;
  }

  return {
    reference,
    status: asString(record.status),
    alreadyProcessed: asBoolean(record.alreadyProcessed),
  };
}

export type RefundResult = {
  refunded: boolean;
  reference: string;
  status: string | null;
  accessRevoked: boolean;
};

export function parseRefundResult(raw: unknown): RefundResult | null {
  const record = asRecord(raw);
  const reference = asString(record?.reference);

  if (!record || !reference) {
    return null;
  }

  return {
    refunded: asBoolean(record.refunded),
    reference,
    status: asString(record.status),
    accessRevoked: asBoolean(record.accessRevoked),
  };
}
