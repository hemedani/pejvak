/**
 * Admin formatting, pinned to en-US like the rest of the web client.
 *
 * The one non-obvious rule: a conversion rate can be small. `formatPercent`
 * rounds to a whole percent, which would render 0.25% as "0%" and make a real
 * number look like a broken one, so this module keeps two decimals.
 */

import type { UserRole, UserStatus } from "@/lib/domain/user";
import { formatNumber } from "@/lib/format";

import type { BillingInterval } from "./domain/plans";
import type { GrantDurationUnit } from "./domain/subscriptions";

export function formatMoney(cents: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
    }).format(cents / 100);
  } catch {
    return `${(cents / 100).toFixed(2)} ${currency}`;
  }
}

/** `-1` is the plan's word for unlimited; never render it as a negative number. */
export function formatLimit(value: number): string {
  return value === -1 ? "Unlimited" : formatNumber(value);
}

export function formatRate(ratio: number): string {
  if (!Number.isFinite(ratio)) {
    return "—";
  }
  return new Intl.NumberFormat("en-US", {
    style: "percent",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(ratio);
}

export function formatBillingInterval(interval: BillingInterval): string {
  switch (interval) {
    case "year":
      return "Yearly";
    case "lifetime":
      return "Lifetime";
    case "month":
      return "Monthly";
  }
}

export function formatIntervalForPeriod(
  interval: string | null | undefined,
): string {
  switch (interval) {
    case "year":
      return "per year";
    case "lifetime":
      return "one-time";
    case "month":
      return "per month";
    default:
      return "";
  }
}

export function formatRole(role: UserRole): string {
  switch (role) {
    case "admin":
      return "Admin";
    case "support":
      return "Support";
    case "user":
      return "Listener";
  }
}

export function formatStatus(status: UserStatus): string {
  switch (status) {
    case "suspended":
      return "Suspended";
    case "deleted":
      return "Deleted";
    case "active":
      return "Active";
  }
}

/** A wire enum in sentence case, without pretending it is a closed vocabulary. */
export function formatEnum(value: string): string {
  if (value === "") {
    return "Unknown";
  }
  return value.charAt(0).toUpperCase() + value.slice(1).replaceAll("_", " ");
}

export function formatGrantDuration(
  value: number,
  unit: GrantDurationUnit,
): string {
  return `${formatNumber(value)} ${unit}${value === 1 ? "" : "s"}`;
}

export function orDash(value: string | null | undefined): string {
  return value && value.trim() !== "" ? value : "—";
}
