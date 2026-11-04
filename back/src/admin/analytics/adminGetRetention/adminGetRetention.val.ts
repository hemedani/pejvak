import { enums, number, object, optional } from "lesan";

export const adminGetRetentionValidator = () =>
  object({
    set: object({
      /** Weekly cohorts to include, 1–12. Defaults to 6. */
      cohorts: optional(number()),
      /** Weeks tracked per cohort, 1–12. Defaults to 6. */
      weeks: optional(number()),
    }),
    get: optional(
      object({
        cohorts: optional(
          object({
            cohortStart: optional(enums([0, 1])),
            cohortDate: optional(enums([0, 1])),
            size: optional(enums([0, 1])),
            weeks: optional(
              object({
                week: optional(enums([0, 1])),
                activeUsers: optional(enums([0, 1])),
                rate: optional(enums([0, 1])),
              }),
            ),
          }),
        ),
        weeks: optional(enums([0, 1])),
      }),
    ),
  });
