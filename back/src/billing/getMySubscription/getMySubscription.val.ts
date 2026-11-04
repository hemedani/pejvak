import { enums, object, optional } from "lesan";
import {
  limitsProjection,
  quotaProjection,
} from "../../entitlements/structs.ts";

export const getMySubscriptionValidator = () =>
  object({
    set: object({}),
    get: optional(
      object({
        planCode: optional(enums([0, 1])),
        planTitle: optional(enums([0, 1])),
        isPaid: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        currentPeriodEnd: optional(enums([0, 1])),
        cancelAtPeriodEnd: optional(enums([0, 1])),
        autoRenew: optional(enums([0, 1])),
        startedAt: optional(enums([0, 1])),
        grantMode: optional(enums([0, 1])),
        usageCaps: optional(
          object({
            historyEntries: optional(enums([0, 1])),
            playlists: optional(enums([0, 1])),
            maxTracks: optional(enums([0, 1])),
          }),
        ),
        priceCents: optional(enums([0, 1])),
        currency: optional(enums([0, 1])),
        billingInterval: optional(enums([0, 1])),
        description: optional(enums([0, 1])),
        features: optional(enums([0, 1])),
        limits: optional(limitsProjection()),
        history: optional(quotaProjection()),
      }),
    ),
  });
