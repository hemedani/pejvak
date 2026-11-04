/**
 * Admin query shapes and fetch bounds.
 *
 * A `"use server"` module may export only async functions, so every constant and
 * type here lives beside the domain rather than in an action file. `tsc` accepts
 * an exported const there; `next build` does not.
 *
 * The list acts page 25 at a time and clamp a limit to 1–200 on the server. The
 * panel's defaults mirror that clamp rather than inventing a second range.
 */

import type { UserRole, UserStatus } from "@/lib/domain/user";

export const ADMIN_PAGE_SIZE = 25;
export const ADMIN_MAX_LIMIT = 200;

export type SortOrder = "asc" | "desc";

export type AdminUserQuery = {
  page?: number;
  limit?: number;
  role?: UserRole;
  status?: UserStatus;
  planCode?: string;
  search?: string;
  sortBy?: string;
  sortOrder?: SortOrder;
};

export type AdminSubscriptionQuery = {
  page?: number;
  limit?: number;
  status?: string;
  planCode?: string;
  search?: string;
};

export type AdminTransactionQuery = {
  page?: number;
  limit?: number;
  status?: string;
  provider?: string;
  planCode?: string;
  userId?: string;
  search?: string;
  from?: number;
  to?: number;
};

export type AdminAuditQuery = {
  page?: number;
  limit?: number;
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: number;
  to?: number;
};

export type AnalyticsWindow = {
  days?: number;
};

export type RetentionWindow = {
  cohorts?: number;
  weeks?: number;
};

export const USER_ROLES: UserRole[] = ["user", "support", "admin"];
export const USER_STATUSES: UserStatus[] = ["active", "suspended", "deleted"];

export const USER_SORT_FIELDS = [
  "createdAt",
  "updatedAt",
  "username",
  "email",
  "displayName",
] as const;

export const SUBSCRIPTION_STATUSES = [
  "active",
  "trialing",
  "past_due",
  "canceled",
  "expired",
] as const;

export const TRANSACTION_STATUSES = [
  "pending",
  "paid",
  "failed",
  "canceled",
  "refunded",
] as const;

export const BILLING_INTERVALS = ["month", "year", "lifetime"] as const;

export function boundedPage(value: number | undefined): number {
  return Number.isFinite(value) ? Math.max(1, Math.trunc(value as number)) : 1;
}

export function boundedLimit(value: number | undefined): number {
  if (!Number.isFinite(value)) {
    return ADMIN_PAGE_SIZE;
  }
  return Math.min(Math.max(Math.trunc(value as number), 1), ADMIN_MAX_LIMIT);
}

export function trimmed(value: string | undefined): string | undefined {
  const text = value?.trim();
  return text ? text : undefined;
}

export function oneOf<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
): T | undefined {
  return allowed.includes(value as T) ? (value as T) : undefined;
}

export function wholeNumber(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(Math.max(Math.trunc(value as number), min), max);
}

export function clampDays(value: number | undefined): number {
  return wholeNumber(value, 30, 7, 90);
}
