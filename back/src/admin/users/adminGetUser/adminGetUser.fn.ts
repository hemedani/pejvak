import { type ActFn, ObjectId } from "lesan";
import {
  annotation,
  onlineCollection,
  playbackContext,
  playbackSession,
  playlist,
  track,
  user,
} from "../../../../mod.ts";
import { pickByGet, throwError } from "@lib";
import {
  historyQuotaOf,
  resolveEntitlement,
} from "../../../entitlements/entitlement.ts";
import { clamp } from "../../time.ts";
import { safeUserProjection } from "../../query.ts";

/**
 * Everything the panel shows on one account, in one round trip.
 *
 * The usage block is computed rather than stored: a `sessionCount` column would
 * have to be maintained by every sync and every delete, and the first missed
 * increment would make the panel disagree with the history it is describing.
 * These are `countDocument` calls on an indexed field, which is cheap enough
 * for a page an operator opens by hand.
 */
export const adminGetUserFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const userId = new ObjectId(set.userId);
  const sessionsLimit = clamp(set.sessionsLimit ?? 10, 0, 50);

  const foundUser = await user.findOne({
    filters: { _id: userId },
    projection: safeUserProjection(get?.user),
  });

  if (!foundUser) throwError("User not found");

  const targetUser = foundUser!;

  const entitlement = await resolveEntitlement(userId);
  const historyQuota = await historyQuotaOf(userId, entitlement.limits);

  const [
    sessionsFacet,
    tracksFacet,
    annotationCount,
    playlistCount,
    contextCount,
    onlineCollectionCount,
    recentSessions,
  ] = await Promise.all([
    playbackSession
      .aggregation({
        pipeline: [
          { $match: { "user._id": userId } },
          {
            $group: {
              _id: null,
              sessionCount: { $sum: 1 },
              listenTimeSec: { $sum: "$durationListenedSec" },
              firstActiveAt: { $min: "$startedAt" },
              lastActiveAt: { $max: "$startedAt" },
            },
          },
        ],
      })
      .toArray(),
    track
      .aggregation({
        pipeline: [
          { $match: { "user._id": userId } },
          {
            $group: {
              _id: null,
              trackCount: { $sum: 1 },
              storageBytes: { $sum: "$fileSizeBytes" },
            },
          },
        ],
      })
      .toArray(),
    annotation.countDocument({ filter: { "user._id": userId } }),
    playlist.countDocument({ filter: { "user._id": userId } }),
    playbackContext.countDocument({ filter: { "user._id": userId } }),
    onlineCollection.countDocument({ filter: { "user._id": userId } }),
    sessionsLimit > 0
      ? playbackSession
        .aggregation({
          pipeline: [
            { $match: { "user._id": userId } },
            { $sort: { startedAt: -1 } },
            { $limit: sessionsLimit },
            {
              $project: {
                _id: 1,
                contentHash: 1,
                startedAt: 1,
                endedAt: 1,
                durationListenedSec: 1,
                startPositionSec: 1,
                endPositionSec: 1,
                playbackSpeed: 1,
                completed: 1,
                interrupted: 1,
                seeked: 1,
                deviceInfo: 1,
                contextType: 1,
                contextKey: 1,
                "track.title": 1,
              },
            },
          ],
        })
        .toArray()
      : Promise.resolve([]),
  ]);

  const sessions = sessionsFacet[0] ?? {};
  const tracks = tracksFacet[0] ?? {};

  return pickByGet({
    user: {
      ...targetUser,
      role: targetUser.role ?? "user",
      status: targetUser.status ?? "active",
    },
    entitlement,
    historyQuota,
    usage: {
      sessionCount: sessions.sessionCount ?? 0,
      listenTimeSec: sessions.listenTimeSec ?? 0,
      firstActiveAt: sessions.firstActiveAt ?? null,
      lastActiveAt: sessions.lastActiveAt ?? null,
      trackCount: tracks.trackCount ?? 0,
      storageBytes: tracks.storageBytes ?? 0,
      annotationCount,
      playlistCount,
      contextCount,
      onlineCollectionCount,
    },
    recentSessions,
  }, get);
};
