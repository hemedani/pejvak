import {
  array,
  boolean,
  defaulted,
  number,
  object,
  optional,
  string,
} from "lesan";

export const syncLocalDataValidator = () =>
  object({
    set: object({
      sessions: defaulted(
        array(
          object({
            clientId: string(),
            contentHash: string(),
            startedAt: number(),
            endedAt: optional(number()),
            startPositionSec: defaulted(number(), 0),
            endPositionSec: defaulted(number(), 0),
            durationListenedSec: defaulted(number(), 0),
            playbackSpeed: defaulted(number(), 1),
            completed: defaulted(boolean(), false),
            interrupted: defaulted(boolean(), false),
            deviceInfo: optional(string()),
          }),
        ),
        [],
      ),
      annotations: defaulted(
        array(
          object({
            clientId: string(),
            contentHash: string(),
            positionSec: number(),
            text: string(),
            tags: defaulted(array(string()), []),
            color: optional(string()),
          }),
        ),
        [],
      ),
    }),
    get: object({
      syncedSessions: number(),
      syncedAnnotations: number(),
    }),
  });
