import { enums, object, optional } from "lesan";

export const getMyStatsValidator = () =>
  object({
    set: object({}),
    get: optional(
      object({
        totalListenTimeSec: optional(enums([0, 1])),
        sessionCount: optional(enums([0, 1])),
        trackCount: optional(enums([0, 1])),
        firstListenedAt: optional(enums([0, 1])),
        lastListenedAt: optional(enums([0, 1])),
        tracks: optional(
          object({
            contentHash: optional(enums([0, 1])),
            listenTimeSec: optional(enums([0, 1])),
            playCount: optional(enums([0, 1])),
            lastPlayedAt: optional(enums([0, 1])),
          }),
        ),
      }),
    ),
  });
