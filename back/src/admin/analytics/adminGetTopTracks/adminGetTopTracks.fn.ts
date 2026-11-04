import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { playbackSession, track } from "../../../../mod.ts";
import { clamp, DAY_MS } from "../../time.ts";

/**
 * The most-listened tracks across the whole platform.
 *
 * Ranked by **listening time**, not play count: a track opened and skipped
 * after three seconds is a play, and ranking by that would put accidental taps
 * at the top. `listenerCount` is a set size, so it answers "how many people",
 * which a raw play count cannot.
 *
 * Titles are joined from the `track` collection rather than taken from the
 * session's embedded copy. The copy is a snapshot from sync time; a rename
 * would leave the panel showing the old name forever.
 */
export const adminGetTopTracksFn: ActFn = async (body) => {
  const days = clamp(body.details.set.days ?? 30, 1, 365);
  const limit = clamp(body.details.set.limit ?? 10, 1, 50);
  const since = Date.now() - days * DAY_MS;

  const grouped = await playbackSession
    .aggregation({
      pipeline: [
        { $match: { startedAt: { $gte: since } } },
        {
          $group: {
            _id: "$track._id",
            contentHash: { $first: "$contentHash" },
            listenTimeSec: { $sum: "$durationListenedSec" },
            playCount: { $sum: 1 },
            listeners: { $addToSet: "$user._id" },
            fallbackTitle: { $first: "$track.title" },
          },
        },
        { $sort: { listenTimeSec: -1 } },
        { $limit: limit },
      ],
    })
    .toArray();

  const ids = grouped.map((row) => row._id).filter(Boolean);

  const tracks = ids.length > 0
    ? await track
      .aggregation({
        pipeline: [
          { $match: { _id: { $in: ids } } },
          { $project: { title: 1, author: 1, isAudiobook: 1, origin: 1 } },
        ],
      })
      .toArray()
    : [];

  const trackById = new Map(tracks.map((row) => [String(row._id), row]));

  return pickByGet({
    days,
    rows: grouped.map((row) => {
      const found = trackById.get(String(row._id));
      return {
        trackId: row._id ? String(row._id) : null,
        contentHash: row.contentHash ?? null,
        title: found?.title ?? row.fallbackTitle ?? "Unknown track",
        author: found?.author ?? null,
        isAudiobook: found?.isAudiobook ?? false,
        origin: found?.origin ?? "local",
        listenTimeSec: Number(row.listenTimeSec ?? 0),
        playCount: Number(row.playCount ?? 0),
        listenerCount: Array.isArray(row.listeners) ? row.listeners.length : 0,
      };
    }),
  }, body.details.get);
};
