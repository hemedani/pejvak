import {
  array,
  boolean,
  defaulted,
  enums,
  nullable,
  number,
  object,
  optional,
  refine,
  size,
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
      /**
       * The full shared-settings snapshot. Optional so every existing client
       * keeps working; `updatedAt` is the device's LWW token, not a Date.
       */
      settings: optional(
        object({
          languageCode: nullable(size(string(), 0, 16)),
          defaultSpeed: refine(
            number(),
            "defaultSpeed between 0.5 and 3.0",
            (value) => value >= 0.5 && value <= 3,
          ),
          historySort: enums(["newest", "oldest", "longest"]),
          updatedAt: number(),
        }),
      ),
      /**
       * Saved / favourited / downloaded online collections.
       *
       * Nothing here is resolved server-side: the collection is named by its own
       * key, so unlike a playlist there is no parent row that has to exist
       * first. `updatedAt` drives last-write-wins and `deleted` carries the
       * device's tombstone, so a removal is not resurrected by the next push of
       * a stale local copy.
       */
      onlineCollections: optional(
        array(
          object({
            clientId: string(),
            sourceId: string(),
            externalId: string(),
            title: string(),
            languageCode: string(),
            subtitle: optional(string()),
            artworkUrl: optional(string()),
            trackCount: defaulted(number(), 0),
            pageUrl: optional(string()),
            isFavorite: defaulted(boolean(), false),
            lastOpenedAt: optional(number()),
            updatedAt: optional(number()),
            deleted: defaulted(boolean(), false),
          }),
        ),
      ),
    }),
    get: optional(
      object({
        syncedSessions: optional(enums([0, 1])),
        syncedAnnotations: optional(enums([0, 1])),
        syncedPlaylists: optional(enums([0, 1])),
        syncedContextPlays: optional(enums([0, 1])),
        syncedOnlineCollections: optional(enums([0, 1])),
        syncedSettings: optional(enums([0, 1])),
        settings: optional(
          object({
            languageCode: optional(enums([0, 1])),
            defaultSpeed: optional(enums([0, 1])),
            historySort: optional(enums([0, 1])),
            updatedAt: optional(enums([0, 1])),
          }),
        ),
        annotations: optional(
          array(
            object({
              clientId: optional(enums([0, 1])),
              serverId: optional(enums([0, 1])),
            }),
          ),
        ),
        playlists: optional(
          array(
            object({
              clientId: optional(enums([0, 1])),
              serverId: optional(enums([0, 1])),
            }),
          ),
        ),
        contextPlays: optional(
          array(
            object({
              clientId: optional(enums([0, 1])),
              serverId: optional(enums([0, 1])),
            }),
          ),
        ),
        onlineCollections: optional(
          array(
            object({
              clientId: optional(enums([0, 1])),
              serverId: optional(enums([0, 1])),
            }),
          ),
        ),
      }),
    ),
  });
