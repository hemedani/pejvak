import { enums, number, object, optional } from "lesan";

export const adminGetTopTracksValidator = () =>
  object({
    set: object({
      /** Window in days, clamped to 1–365. Defaults to 30. */
      days: optional(number()),
      /** Rows to return, clamped to 1–50. Defaults to 10. */
      limit: optional(number()),
    }),
    get: optional(
      object({
        days: optional(enums([0, 1])),
        rows: optional(
          object({
            trackId: optional(enums([0, 1])),
            contentHash: optional(enums([0, 1])),
            title: optional(enums([0, 1])),
            author: optional(enums([0, 1])),
            isAudiobook: optional(enums([0, 1])),
            origin: optional(enums([0, 1])),
            listenTimeSec: optional(enums([0, 1])),
            playCount: optional(enums([0, 1])),
            listenerCount: optional(enums([0, 1])),
          }),
        ),
      }),
    ),
  });
