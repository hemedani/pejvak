import { enums, object, optional, pattern, string } from "lesan";

export const getMyAiUsageValidator = () =>
  object({
    set: object({
      /** `YYYY-MM`. Defaults to the current UTC month. */
      periodKey: optional(pattern(string(), /^\d{4}-\d{2}$/)),
    }),
    get: optional(
      object({
        periodKey: optional(enums([0, 1])),
        enabled: optional(enums([0, 1])),
        planCode: optional(enums([0, 1])),
        allowance: optional(enums([0, 1])),
        bonusCredits: optional(enums([0, 1])),
        used: optional(enums([0, 1])),
        remaining: optional(enums([0, 1])),
        requestCount: optional(enums([0, 1])),
        lastUsedAt: optional(enums([0, 1])),
      }),
    ),
  });
