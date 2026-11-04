import { enums, number, object, objectIdValidation, optional } from "lesan";
import {
  entitlementProjection,
  quotaProjection,
} from "../../../entitlements/structs.ts";
import { safeUserStruct } from "../../query.ts";

export const adminGetUserValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      /** How much of the listener's history to include. 0 means none. */
      sessionsLimit: optional(number()),
    }),
    get: optional(
      object({
        user: optional(safeUserStruct()),
        entitlement: optional(entitlementProjection()),
        historyQuota: optional(quotaProjection()),
        usage: optional(
          object({
            sessionCount: optional(enums([0, 1])),
            listenTimeSec: optional(enums([0, 1])),
            firstActiveAt: optional(enums([0, 1])),
            lastActiveAt: optional(enums([0, 1])),
            trackCount: optional(enums([0, 1])),
            storageBytes: optional(enums([0, 1])),
            annotationCount: optional(enums([0, 1])),
            playlistCount: optional(enums([0, 1])),
            contextCount: optional(enums([0, 1])),
            onlineCollectionCount: optional(enums([0, 1])),
          }),
        ),
        recentSessions: optional(
          object({
            _id: optional(enums([0, 1])),
            contentHash: optional(enums([0, 1])),
            startedAt: optional(enums([0, 1])),
            endedAt: optional(enums([0, 1])),
            durationListenedSec: optional(enums([0, 1])),
            startPositionSec: optional(enums([0, 1])),
            endPositionSec: optional(enums([0, 1])),
            playbackSpeed: optional(enums([0, 1])),
            completed: optional(enums([0, 1])),
            interrupted: optional(enums([0, 1])),
            seeked: optional(enums([0, 1])),
            deviceInfo: optional(enums([0, 1])),
            contextType: optional(enums([0, 1])),
            contextKey: optional(enums([0, 1])),
            track: optional(
              object({
                title: optional(enums([0, 1])),
              }),
            ),
          }),
        ),
      }),
    ),
  });
