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
            /** Set when the session was part of a collection run. */
            contextPlayId: optional(string()),
            contextType: optional(string()),
            contextKey: optional(string()),
            /** The listening stretch this session belongs to. */
            stretchId: optional(string()),
            /** Set when the listener scrubbed during the session. */
            seeked: defaulted(boolean(), false),
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
      /**
       * Finished runs through a collection. `endedAt` is required because only
       * an ended run has final figures — an in-progress one is not sent.
       */
      contextPlays: optional(
        array(
          object({
            clientId: string(),
            contextType: string(),
            contextKey: string(),
            contextTitle: string(),
            trackCount: defaulted(number(), 0),
            startedAt: number(),
            endedAt: number(),
            lastIndex: defaulted(number(), 0),
            lastTrackId: optional(string()),
            lastPositionSec: defaulted(number(), 0),
            listenedSec: defaulted(number(), 0),
            finishedCount: defaulted(number(), 0),
            completed: defaulted(boolean(), false),
            interrupted: defaulted(boolean(), false),
            updatedAt: optional(number()),
          }),
        ),
      ),
    }),
    get: object({
      syncedSessions: optional(number()),
      syncedAnnotations: optional(number()),
      syncedPlaylists: optional(number()),
      syncedContextPlays: optional(number()),
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
      contextPlays: optional(
        array(
          object({
            clientId: string(),
            serverId: optional(string()),
          }),
        ),
      ),
    }),
  });
