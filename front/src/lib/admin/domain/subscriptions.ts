/**
 * Who is on which plan, until when.
 *
 * The backend sorts by `currentPeriodEnd` ascending so the next expiry is at
 * the top. A lifetime row has no end at all, and Mongo's sort puts a missing
 * value where its type order says — so the table re-sorts for display and puts
 * "no end" last. It never labels the first row "next renewal" on the server's
 * word alone.
 */

import { asBoolean, asNumber, asRecord, asString, asTimestamp } from "@/lib/parse";

export type SubscriptionUser = {
  id: string | null;
  email: string | null;
  username: string | null;
  displayName: string | null;
};

export type AdminSubscription = {
  id: string;
  planCode: string;
  status: string;
  startedAt: number | null;
  currentPeriodStart: number | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  canceledAt: number | null;
  provider: string;
  providerRef: string | null;
  autoRenew: boolean;
  note: string | null;
  createdAt: number | null;
  user: SubscriptionUser | null;
};

export type GrantMode = "forever" | "duration" | "usage";
export type GrantDurationUnit = "day" | "week" | "month" | "year";

export const SUBSCRIPTION_GET = {
  _id: 1,
  planCode: 1,
  status: 1,
  startedAt: 1,
  currentPeriodStart: 1,
  currentPeriodEnd: 1,
  cancelAtPeriodEnd: 1,
  canceledAt: 1,
  provider: 1,
  providerRef: 1,
  autoRenew: 1,
  note: 1,
  createdAt: 1,
  user: { _id: 1, email: 1, username: 1, displayName: 1 },
} as const;

function parseUser(raw: unknown): SubscriptionUser | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  return {
    id: asString(record._id),
    email: asString(record.email),
    username: asString(record.username),
    displayName: asString(record.displayName),
  };
}

export function parseSubscription(raw: unknown): AdminSubscription | null {
  const record = asRecord(raw);
  const id = asString(record?._id);
  const planCode = asString(record?.planCode);

  if (!record || !id || !planCode) {
    return null;
  }

  return {
    id,
    planCode,
    status: asString(record.status) ?? "unknown",
    startedAt: asTimestamp(record.startedAt),
    currentPeriodStart: asTimestamp(record.currentPeriodStart),
    currentPeriodEnd: asTimestamp(record.currentPeriodEnd),
    cancelAtPeriodEnd: asBoolean(record.cancelAtPeriodEnd),
    canceledAt: asTimestamp(record.canceledAt),
    provider: asString(record.provider) ?? "unknown",
    providerRef: asString(record.providerRef),
    autoRenew: asBoolean(record.autoRenew),
    note: asString(record.note),
    createdAt: asTimestamp(record.createdAt),
    user: parseUser(record.user),
  };
}

/**
 * Sort for a table an operator reads, not for a machine.
 *
 * `null` means lifetime / no end, which belongs after every dated row regardless
 * of what the backend's ascending sort did with it.
 */
export function sortSubscriptionsForDisplay(
  rows: AdminSubscription[],
): AdminSubscription[] {
  return [...rows].sort((a, b) => {
    if (a.currentPeriodEnd === null && b.currentPeriodEnd === null) {
      return a.id.localeCompare(b.id);
    }
    if (a.currentPeriodEnd === null) return 1;
    if (b.currentPeriodEnd === null) return -1;
    return a.currentPeriodEnd - b.currentPeriodEnd || a.id.localeCompare(b.id);
  });
}

export type GrantResult = {
  reference: string | null;
  planCode: string | null;
  planTitle: string | null;
  status: string | null;
};

export function parseGrantResult(raw: unknown): GrantResult | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  return {
    reference: asString(record.reference),
    planCode: asString(record.planCode),
    planTitle: asString(record.planTitle),
    status: asString(record.status),
  };
}

export type RevokeResult = {
  revoked: boolean;
  planCode: string | null;
  status: string | null;
};

export function parseRevokeResult(raw: unknown): RevokeResult | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  return {
    revoked: asBoolean(record.revoked),
    planCode: asString(record.planCode),
    status: asString(record.status),
  };
}

export function asGrantMode(value: unknown): GrantMode | null {
  return value === "forever" || value === "duration" || value === "usage"
    ? value
    : null;
}

export function asGrantUnit(value: unknown): GrantDurationUnit | null {
  return value === "day" || value === "week" || value === "month" ||
      value === "year"
    ? value
    : null;
}

export function parseAmount(value: unknown): number | null {
  return asNumber(value);
}
