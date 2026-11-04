/**
 * Plans are data, not constants (D4 on the backend).
 *
 * Price, interval and every limit are read from the row the server returns. The
 * panel never assumes USD and never treats `-1` as zero: `-1` is the plan's word
 * for unlimited, and every display helper turns it into that word rather than a
 * negative number.
 */

import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asTimestamp,
} from "@/lib/parse";

export type BillingInterval = "month" | "year" | "lifetime";

export type PlanLimits = {
  historyEntries: number;
  crossDeviceSync: boolean;
  playlists: number;
  maxTracks: number;
  aiCreditsPerMonth: number;
};

export type AdminPlan = {
  id: string;
  code: string;
  title: string;
  description: string | null;
  priceCents: number;
  currency: string;
  billingInterval: BillingInterval;
  isActive: boolean;
  isDefault: boolean;
  sortOrder: number;
  limits: PlanLimits;
  features: string[];
  subscribers: number;
  createdAt: number | null;
  updatedAt: number | null;
};

/** What an upsert returns: the row, without the live subscriber count. */
export const PLAN_FIELDS = {
  _id: 1,
  code: 1,
  title: 1,
  description: 1,
  priceCents: 1,
  currency: 1,
  billingInterval: 1,
  isActive: 1,
  isDefault: 1,
  sortOrder: 1,
  limits: 1,
  features: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export const PLAN_GET = {
  _id: 1,
  code: 1,
  title: 1,
  description: 1,
  priceCents: 1,
  currency: 1,
  billingInterval: 1,
  isActive: 1,
  isDefault: 1,
  sortOrder: 1,
  limits: 1,
  features: 1,
  createdAt: 1,
  updatedAt: 1,
  subscribers: 1,
} as const;

function asInterval(value: unknown): BillingInterval {
  return value === "year" || value === "lifetime" ? value : "month";
}

export function parseLimits(raw: unknown): PlanLimits {
  const record = asRecord(raw);

  return {
    historyEntries: asNumber(record?.historyEntries) ?? 0,
    crossDeviceSync: asBoolean(record?.crossDeviceSync),
    playlists: asNumber(record?.playlists) ?? 0,
    maxTracks: asNumber(record?.maxTracks) ?? 0,
    aiCreditsPerMonth: asNumber(record?.aiCreditsPerMonth) ?? 0,
  };
}

export function parsePlan(raw: unknown): AdminPlan | null {
  const record = asRecord(raw);
  const code = asString(record?.code);
  const id = asString(record?._id);

  if (!record || !code || !id) {
    return null;
  }

  return {
    id,
    code,
    title: asString(record.title) ?? code,
    description: asString(record.description),
    priceCents: asNumber(record.priceCents) ?? 0,
    currency: asString(record.currency) ?? "USD",
    billingInterval: asInterval(record.billingInterval),
    // The backend normalises a missing flag to active; a broken row must not
    // silently disappear from the list an operator is trying to repair.
    isActive: record.isActive !== false,
    isDefault: asBoolean(record.isDefault),
    sortOrder: asNumber(record.sortOrder) ?? 0,
    limits: parseLimits(record.limits),
    features: asArray(record.features)
      .map((feature) => asString(feature))
      .filter((feature): feature is string => feature !== null),
    subscribers: asNumber(record.subscribers) ?? 0,
    createdAt: asTimestamp(record.createdAt),
    updatedAt: asTimestamp(record.updatedAt),
  };
}
