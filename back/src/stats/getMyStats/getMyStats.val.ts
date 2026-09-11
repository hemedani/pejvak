import { array, number, object, optional, string } from "lesan";

export const getMyStatsValidator = () =>
  object({
    set: object({}),
    get: object({
      totalListenTimeSec: number(),
      sessionCount: number(),
      trackCount: number(),
      firstListenedAt: optional(number()),
      lastListenedAt: optional(number()),
      tracks: array(
        object({
          contentHash: string(),
          listenTimeSec: number(),
          playCount: number(),
          lastPlayedAt: optional(number()),
        }),
      ),
    }),
  });
