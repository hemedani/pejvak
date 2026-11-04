import { enums, object, optional } from "lesan";

/**
 * Projection structs for the shapes that are computed rather than stored.
 *
 * `selectStruct` builds a projection from a model's pure fields, which is
 * exactly wrong for an entitlement: it is assembled from a plan row, a
 * subscription row and the clock, and it belongs to no single schema. These
 * are hand-written for the same reason `getMyStats` hand-writes its `get`.
 */
export const limitsProjection = () =>
  object({
    historyEntries: optional(enums([0, 1])),
    crossDeviceSync: optional(enums([0, 1])),
    playlists: optional(enums([0, 1])),
    maxTracks: optional(enums([0, 1])),
    aiCreditsPerMonth: optional(enums([0, 1])),
  });

export const quotaProjection = () =>
  object({
    limit: optional(enums([0, 1])),
    used: optional(enums([0, 1])),
    remaining: optional(enums([0, 1])),
    unlimited: optional(enums([0, 1])),
  });

export const entitlementProjection = () =>
  object({
    planCode: optional(enums([0, 1])),
    planTitle: optional(enums([0, 1])),
    isPaid: optional(enums([0, 1])),
    limits: optional(limitsProjection()),
    subscriptionStatus: optional(enums([0, 1])),
    currentPeriodEnd: optional(enums([0, 1])),
    cancelAtPeriodEnd: optional(enums([0, 1])),
    autoRenew: optional(enums([0, 1])),
    startedAt: optional(enums([0, 1])),
  });
