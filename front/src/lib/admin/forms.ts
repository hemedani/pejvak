/**
 * The payloads an admin form may submit.
 *
 * They live outside the action modules for the same bundler rule as the query
 * shapes: a `"use server"` module may export only async functions. Keeping a
 * submitted shape here also makes it obvious when a form has grown a field the
 * wire does not know about.
 */

import type { UserRole, UserStatus } from "@/lib/domain/user";

import type { BillingInterval, PlanLimits } from "./domain/plans";
import type { GrantDurationUnit, GrantMode } from "./domain/subscriptions";

export type UpdateUserInput = {
  userId: string;
  username?: string;
  email?: string;
  displayName?: string;
  avatarUrl?: string;
  role?: UserRole;
  status?: Extract<UserStatus, "active" | "suspended">;
  suspendedReason?: string;
};

export type DeleteUserInput = {
  userId: string;
  confirmEmail: string;
};

export type ResetPasswordInput = {
  userId: string;
  /** Omitted means "generate a strong password on the server". */
  password?: string;
};

export type UpsertPlanInput = {
  code: string;
  title?: string;
  description?: string;
  priceCents?: number;
  currency?: string;
  billingInterval?: BillingInterval;
  isActive?: boolean;
  isDefault?: boolean;
  sortOrder?: number;
  limits?: Partial<PlanLimits>;
  features?: string[];
};

export type GrantSubscriptionInput = {
  userId: string;
  planCode: string;
  mode?: GrantMode;
  duration?: { value: number; unit: GrantDurationUnit };
  caps?: {
    historyEntries?: number;
    playlists?: number;
    maxTracks?: number;
  };
  interval?: BillingInterval;
  note?: string;
};

export type RevokeSubscriptionInput = {
  userId: string;
  reason?: string;
};

export type ConfirmTransactionInput = {
  reference: string;
  note?: string;
};

export type RefundTransactionInput = {
  reference: string;
  reason?: string;
};

export type UpdatePlatformInput = {
  signupsEnabled?: boolean;
  aiEnabled?: boolean;
  maintenanceMode?: boolean;
  announcement?: string;
};

export type GrantAiCreditsInput = {
  userId: string;
  credits: number;
  periodKey?: string;
  note?: string;
};
