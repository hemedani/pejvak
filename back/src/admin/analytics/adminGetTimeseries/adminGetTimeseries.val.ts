import { enums, number, object, optional } from "lesan";

export const adminGetTimeseriesValidator = () =>
  object({
    set: object({
      /** Window length in days, clamped to 7–90. Defaults to 30. */
      days: optional(number()),
    }),
    get: optional(
      object({
        days: optional(
          object({
            date: optional(enums([0, 1])),
            timestamp: optional(enums([0, 1])),
            signups: optional(enums([0, 1])),
            sessions: optional(enums([0, 1])),
            listenTimeSec: optional(enums([0, 1])),
            activeUsers: optional(enums([0, 1])),
          }),
        ),
        from: optional(enums([0, 1])),
        to: optional(enums([0, 1])),
      }),
    ),
  });
