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
      sessions: optional(
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
      ),
      annotations: optional(
        array(
          object({
            clientId: string(),
            contentHash: string(),
            positionSec: number(),
            text: string(),
            tags: defaulted(array(string()), []),
            color: optional(string()),
            updatedAt: optional(number()),
            deleted: defaulted(boolean(), false),
          }),
        ),
      ),
      playlists: optional(
        array(
          object({
            clientId: string(),
            title: string(),
            description: optional(string()),
            isPublic: optional(boolean()),
            items: optional(
              array(object({ contentHash: string(), order: number() })),
            ),
            updatedAt: optional(number()),
            deleted: optional(boolean()),
          }),
        ),
      ),
    }),
    get: object({
      syncedSessions: optional(number()),
      syncedAnnotations: optional(number()),
      syncedPlaylists: optional(number()),
      annotations: optional(
        array(
          object({
            clientId: string(),
            serverId: optional(string()),
          }),
        ),
      ),
      playlists: optional(
        array(
          object({
            clientId: string(),
            serverId: optional(string()),
          }),
        ),
      ),
    }),
  });
