import {
  enums,
  number,
  object,
  objectIdValidation,
  optional,
  string,
} from "lesan";

export const adminGrantSubscriptionValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      planCode: string(),
      /**
       * How much access the admin is giving. Omitted keeps the legacy behaviour:
       * one billing interval of the plan, from its own `billingInterval`.
       */
      mode: optional(enums(["forever", "duration", "usage"])),
      /** Required for `duration`; a calendar amount, not a timestamp. */
      duration: optional(
        object({
          value: number(),
          unit: enums(["day", "week", "month", "year"]),
        }),
      ),
      /**
       * Required for `usage`. Each cap is an absolute stock threshold and
       * replaces that resource's plan limit. The AI meter is not included: it
       * will be a balance-based system of its own.
       */
      caps: optional(
        object({
          historyEntries: optional(number()),
          playlists: optional(number()),
          maxTracks: optional(number()),
        }),
      ),
      /** Legacy: a plan interval used when `mode` is omitted. */
      interval: optional(enums(["month", "year", "lifetime"])),
      note: optional(string()),
    }),
    get: optional(
      object({
        reference: optional(enums([0, 1])),
        planCode: optional(enums([0, 1])),
        planTitle: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        grantMode: optional(enums([0, 1])),
        usageCaps: optional(
          object({
            historyEntries: optional(enums([0, 1])),
            playlists: optional(enums([0, 1])),
            maxTracks: optional(enums([0, 1])),
          }),
        ),
        currentPeriodEnd: optional(enums([0, 1])),
        periodStart: optional(enums([0, 1])),
        periodEnd: optional(enums([0, 1])),
      }),
    ),
  });
