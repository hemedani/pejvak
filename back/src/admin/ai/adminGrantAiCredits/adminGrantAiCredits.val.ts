import {
  enums,
  number,
  object,
  objectIdValidation,
  optional,
  pattern,
  string,
} from "lesan";

export const adminGrantAiCreditsValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      /** Added to the period's bonus pool; negative values are refused. */
      credits: number(),
      /** `YYYY-MM`. Defaults to the current UTC month. */
      periodKey: optional(pattern(string(), /^\d{4}-\d{2}$/)),
      note: optional(string()),
    }),
    get: optional(
      object({
        userId: optional(enums([0, 1])),
        periodKey: optional(enums([0, 1])),
        granted: optional(enums([0, 1])),
        bonusCredits: optional(enums([0, 1])),
        creditsUsed: optional(enums([0, 1])),
      }),
    ),
  });
