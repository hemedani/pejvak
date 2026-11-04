import { ObjectId } from "lesan";
import {
  plan,
  playbackSession,
  playlist,
  subscription,
  track,
} from "../../mod.ts";
import { FREE_PLAN_CODE } from "./codes.ts";

/**
 * What a plan allows, after normalisation.
 *
 * `-1` is unlimited. A number is always compared with `>= 0` before it is
 * enforced, so an old plan document that predates a limit cannot accidentally
 * mean "zero".
 */
export type PlanLimits = {
  historyEntries: number;
  crossDeviceSync: boolean;
  playlists: number;
  maxTracks: number;
  aiCreditsPerMonth: number;
};

export const UNLIMITED = -1;

/**
 * Used when no `free` row exists — a fresh database, or a deployment where an
 * admin archived the row. The backend must never answer "no limits" just
 * because a document is missing, or the paywall would be one bad migration away
 * from silently opening.
 */
export const FALLBACK_LIMITS: PlanLimits = {
  historyEntries: 500,
  crossDeviceSync: true,
  playlists: 10,
  maxTracks: -1,
  aiCreditsPerMonth: 0,
};

export type SubscriptionStatus =
  | "none"
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "expired";

export type GrantMode = "forever" | "duration" | "usage";

export type UsageCaps = {
  historyEntries?: number;
  playlists?: number;
  maxTracks?: number;
};

export type Entitlement = {
  planCode: string;
  planTitle: string;
  /** True for any plan with a price — the flag the clients gate features on. */
  isPaid: boolean;
  limits: PlanLimits;
  subscriptionStatus: SubscriptionStatus;
  currentPeriodEnd?: number;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
  /** Absent when the listener is on the free tier. */
  startedAt?: number;
  /** Present only while an admin grant is what supplies the entitlement. */
  grantMode?: GrantMode;
  usageCaps?: UsageCaps;
};

const integer = (value: unknown, fallback: number): number => {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
};

const boolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === "boolean" ? value : fallback;

export const canonicalLimits = (raw: unknown): PlanLimits => {
  const stored = (raw ?? {}) as Partial<PlanLimits>;

  return {
    historyEntries: integer(
      stored.historyEntries,
      FALLBACK_LIMITS.historyEntries,
    ),
    crossDeviceSync: boolean(
      stored.crossDeviceSync,
      FALLBACK_LIMITS.crossDeviceSync,
    ),
    playlists: integer(stored.playlists, FALLBACK_LIMITS.playlists),
    maxTracks: integer(stored.maxTracks, FALLBACK_LIMITS.maxTracks),
    aiCreditsPerMonth: integer(
      stored.aiCreditsPerMonth,
      FALLBACK_LIMITS.aiCreditsPerMonth,
    ),
  };
};

/**
 * Caps are absolute, non-negative stock thresholds. A negative value is not a
 * cap (old data or a console edit), so it is ignored rather than read as
 * "unlimited" — the same rule that keeps `-5` from silently meaning `-1`.
 */
const normalizeCaps = (caps?: UsageCaps): UsageCaps => {
  const normalized: UsageCaps = {};
  if (!caps) return normalized;

  for (const key of ["historyEntries", "playlists", "maxTracks"] as const) {
    const value = caps[key];
    if (typeof value === "number" && Number.isInteger(value) && value >= 0) {
      normalized[key] = value;
    }
  }

  return normalized;
};

const withCaps = (limits: PlanLimits, caps: UsageCaps): PlanLimits => ({
  ...limits,
  ...(caps.historyEntries !== undefined
    ? { historyEntries: caps.historyEntries }
    : {}),
  ...(caps.playlists !== undefined ? { playlists: caps.playlists } : {}),
  ...(caps.maxTracks !== undefined ? { maxTracks: caps.maxTracks } : {}),
});

type FreePlan = {
  planCode: string;
  planTitle: string;
  limits: PlanLimits;
};

/**
 * The free tier is a **row**, not a constant.
 *
 * It used to be the fallback constants, which quietly broke the promise that an
 * admin can change limits without a deploy: editing the Free plan in the panel
 * changed the pricing page and nothing else. The row is now read on every
 * resolution, and the constants only apply when the row is missing entirely
 * (a fresh database before `bootstrap`, or a deployment where someone archived
 * it). Falling back to *limits* rather than to *no limits* is deliberate — a
 * missing row must never open the paywall.
 */
const readFreePlan = async (): Promise<FreePlan> => {
  const row = await plan.findOne({
    filters: { code: FREE_PLAN_CODE },
    projection: { code: 1, title: 1, limits: 1 },
  });

  return {
    planCode: FREE_PLAN_CODE,
    planTitle: row?.title ?? "Free",
    limits: canonicalLimits(row?.limits),
  };
};

const freeEntitlement = (
  free: FreePlan,
  status: SubscriptionStatus = "none",
  extra: Partial<Entitlement> = {},
): Entitlement => ({
  planCode: free.planCode,
  planTitle: free.planTitle,
  isPaid: false,
  limits: free.limits,
  subscriptionStatus: status,
  cancelAtPeriodEnd: false,
  autoRenew: false,
  ...extra,
});

/**
 * Resolves what a listener is entitled to right now.
 *
 * Three rules matter and are easy to get wrong:
 *
 * 1. **No row means free.** Registration writes no subscription, so absence is
 *    the free tier rather than a broken record.
 * 2. **Free is a plan row too.** Its limits are read from the catalogue so an
 *    admin edit takes effect immediately; the constants are only a fallback for
 *    a missing row.
 * 3. **The clock wins over `status`.** A row that still says `active` after its
 *    `currentPeriodEnd` is expired. Expiry is written lazily on read because
 *    this deployment has no scheduler; the write is best-effort and never
 *    blocks the answer, which is computed from the timestamps either way.
 */
export const resolveEntitlement = async (
  userId: ObjectId,
): Promise<Entitlement> => {
  const free = await readFreePlan();

  const active = await subscription.findOne({
    filters: { "user._id": userId },
    options: { sort: { createdAt: -1 } },
    projection: {
      planCode: 1,
      status: 1,
      startedAt: 1,
      currentPeriodEnd: 1,
      cancelAtPeriodEnd: 1,
      autoRenew: 1,
      grantMode: 1,
      usageCaps: 1,
    },
  });

  if (!active) return freeEntitlement(free);

  const status = (active.status ?? "active") as SubscriptionStatus;

  if (status === "canceled" || status === "expired") {
    return freeEntitlement(free, status, {
      ...(active.currentPeriodEnd !== undefined
        ? { currentPeriodEnd: active.currentPeriodEnd }
        : {}),
    });
  }

  const periodEnd = active.currentPeriodEnd;
  if (periodEnd !== undefined && periodEnd <= Date.now()) {
    // The row still claims to be active but its paid window has passed: write
    // the expiry so the next read (and the panel) sees the truth, then answer
    // as free either way.
    try {
      await subscription.findOneAndUpdate({
        filter: { _id: active._id },
        update: { $set: { status: "expired", updatedAt: new Date() } },
        projection: { _id: 1 },
      });
    } catch {
      // Losing the write only means the sweep is retried on the next read.
    }

    return freeEntitlement(free, "expired", { currentPeriodEnd: periodEnd });
  }

  const foundPlan = await plan.findOne({
    filters: { code: active.planCode },
    projection: { code: 1, title: 1, priceCents: 1, limits: 1 },
  });

  // A subscriber whose plan row disappeared (only possible from a database
  // console: the admin act refuses to archive a plan that still has
  // subscribers) degrades to the free limits rather than to unlimited. Erring
  // towards "no paywall" on a missing document is how a data mistake becomes
  // free Pro for everyone.
  const baseLimits = foundPlan
    ? canonicalLimits(foundPlan.limits)
    : free.limits;
  const isPaid = (foundPlan?.priceCents ?? 0) > 0;
  const grantMode = active.grantMode as GrantMode | undefined;
  let usageCaps: UsageCaps | undefined;
  let limits = baseLimits;

  if (grantMode === "usage") {
    const caps = normalizeCaps(active.usageCaps);

    if (await usageReached(userId, caps)) {
      // A usage grant ends the whole entitlement, not only the capped resource:
      // the listener returns to free with everything free allows.
      try {
        await subscription.findOneAndUpdate({
          filter: { _id: active._id },
          update: { $set: { status: "expired", updatedAt: new Date() } },
          projection: { _id: 1 },
        });
      } catch {
        // Losing the write only means the sweep is retried on the next read.
      }

      return freeEntitlement(free, "expired");
    }

    usageCaps = caps;
    limits = withCaps(baseLimits, caps);
  }

  return {
    planCode: active.planCode,
    planTitle: foundPlan?.title ?? active.planCode,
    isPaid,
    limits,
    subscriptionStatus: status,
    ...(periodEnd !== undefined ? { currentPeriodEnd: periodEnd } : {}),
    cancelAtPeriodEnd: active.cancelAtPeriodEnd ?? false,
    autoRenew: active.autoRenew ?? true,
    ...(active.startedAt !== undefined ? { startedAt: active.startedAt } : {}),
    ...(grantMode !== undefined ? { grantMode } : {}),
    ...(usageCaps !== undefined ? { usageCaps } : {}),
  };
};

export type Quota = {
  limit: number;
  used: number;
  remaining: number;
  unlimited: boolean;
};

export const quotaOf = (limit: number, used: number): Quota => {
  if (limit < 0) {
    return { limit: UNLIMITED, used, remaining: UNLIMITED, unlimited: true };
  }
  return {
    limit,
    used,
    remaining: Math.max(0, limit - used),
    unlimited: false,
  };
};

export const countHistory = (userId: ObjectId): Promise<number> =>
  playbackSession.countDocument({ filter: { "user._id": userId } });

/**
 * True when any capped resource has reached its ceiling.
 *
 * Only the capped resources are counted, so a normal subscription pays nothing
 * here and a usage grant reads at most three indexed counts.
 */
const usageReached = async (
  userId: ObjectId,
  caps: UsageCaps,
): Promise<boolean> => {
  const checks: Promise<boolean>[] = [];

  if (caps.historyEntries !== undefined) {
    checks.push(
      countHistory(userId).then((used) => used >= caps.historyEntries!),
    );
  }
  if (caps.playlists !== undefined) {
    checks.push(
      playlist
        .countDocument({ filter: { "user._id": userId } })
        .then((used) => used >= caps.playlists!),
    );
  }
  if (caps.maxTracks !== undefined) {
    checks.push(
      track
        .countDocument({ filter: { "user._id": userId } })
        .then((used) => used >= caps.maxTracks!),
    );
  }

  return (await Promise.all(checks)).some(Boolean);
};

export const historyQuotaOf = async (
  userId: ObjectId,
  limits: PlanLimits,
): Promise<Quota> => quotaOf(limits.historyEntries, await countHistory(userId));

export const playlistQuotaOf = async (
  userId: ObjectId,
  limits: PlanLimits,
): Promise<Quota> =>
  quotaOf(
    limits.playlists,
    await playlist.countDocument({ filter: { "user._id": userId } }),
  );

export const trackQuotaOf = async (
  userId: ObjectId,
  limits: PlanLimits,
): Promise<Quota> =>
  quotaOf(
    limits.maxTracks,
    await track.countDocument({ filter: { "user._id": userId } }),
  );
