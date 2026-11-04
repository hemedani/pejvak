import { type ActFn, type Document, ObjectId } from "lesan";
import { pickByGet, throwError } from "@lib";
import { playbackSession, user } from "../../../../mod.ts";
import { pageArgs, rangeFilter } from "../../query.ts";

/**
 * A listener's history, read by an operator.
 *
 * Paged and sorted by `startedAt`, not by `_id`: an offline week arrives as one
 * sync batch, so insertion order says when the phone uploaded, not when the
 * listening happened. This is the same trap `getTrackSessions` documents.
 */
export const adminGetUserHistoryFn: ActFn = async (body) => {
  const { set } = body.details;
  const userId = new ObjectId(set.userId);
  const { page, limit, skip } = pageArgs(set.page, set.limit);

  const exists = await user.findOne({
    filters: { _id: userId },
    projection: { _id: 1 },
  });
  if (!exists) throwError("User not found");

  const conditions: Record<string, unknown>[] = [{ "user._id": userId }];

  const range = rangeFilter("startedAt", set.from, set.to);
  if (range) conditions.push(range);
  if (set.contentHash) conditions.push({ contentHash: set.contentHash });

  const match = { $and: conditions };

  const total = await playbackSession.countDocument({ filter: match });

  const rows = await playbackSession
    .aggregation({
      pipeline: [
        { $match: match },
        { $sort: { startedAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            contentHash: 1,
            startedAt: 1,
            endedAt: 1,
            startPositionSec: 1,
            endPositionSec: 1,
            durationListenedSec: 1,
            playbackSpeed: 1,
            completed: 1,
            interrupted: 1,
            seeked: 1,
            contextType: 1,
            contextKey: 1,
            "track.title": 1,
          },
        },
      ] as Document[],
    })
    .toArray();

  return {
    rows: rows.map((row) => pickByGet(row, body.details.get)),
    total,
    page,
    limit,
  };
};
