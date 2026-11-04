import { enums, object, optional } from "lesan";

export const adminGetOverviewValidator = () =>
  object({
    set: object({}),
    get: optional(
      object({
        generatedAt: optional(enums([0, 1])),
        users: optional(
          object({
            total: optional(enums([0, 1])),
            active: optional(enums([0, 1])),
            suspended: optional(enums([0, 1])),
            newLast24h: optional(enums([0, 1])),
            newLast7d: optional(enums([0, 1])),
            newLast30d: optional(enums([0, 1])),
          }),
        ),
        activity: optional(
          object({
            activeLast24h: optional(enums([0, 1])),
            activeLast7d: optional(enums([0, 1])),
            activeLast30d: optional(enums([0, 1])),
          }),
        ),
        content: optional(
          object({
            sessions: optional(enums([0, 1])),
            listenTimeSec: optional(enums([0, 1])),
            lastSessionAt: optional(enums([0, 1])),
            tracks: optional(enums([0, 1])),
            storageBytes: optional(enums([0, 1])),
            annotations: optional(enums([0, 1])),
            playlists: optional(enums([0, 1])),
            contexts: optional(enums([0, 1])),
            onlineCollections: optional(enums([0, 1])),
          }),
        ),
        revenue: optional(
          object({
            mrrCents: optional(enums([0, 1])),
            currency: optional(enums([0, 1])),
            payingUsers: optional(enums([0, 1])),
            arpuCents: optional(enums([0, 1])),
            conversionRate: optional(enums([0, 1])),
            planDistribution: optional(
              object({
                planCode: optional(enums([0, 1])),
                title: optional(enums([0, 1])),
                priceCents: optional(enums([0, 1])),
                isActive: optional(enums([0, 1])),
                users: optional(enums([0, 1])),
              }),
            ),
          }),
        ),
        quota: optional(
          object({
            freeHistoryLimit: optional(enums([0, 1])),
            usersAtLimit: optional(enums([0, 1])),
          }),
        ),
      }),
    ),
  });
