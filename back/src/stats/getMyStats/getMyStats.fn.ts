import { type ActFn, type Document, ObjectId } from "lesan";
import { coreApp, playbackSession } from "../../../mod.ts";
import { type MyContext } from "@lib";

type TrackBucket = {
  contentHash: string;
  listenTimeSec: number;
  playCount: number;
  lastPlayedAt?: number;
};

type StatsFacet = {
  totals?: {
    totalListenTimeSec?: number;
    sessionCount?: number;
    firstListenedAt?: number;
    lastListenedAt?: number;
  }[];
  trackCount?: { count?: number }[];
  tracks?: TrackBucket[];
};

export const getMyStatsFn: ActFn = async () => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  const pipeline: Document[] = [
    { $match: { "user._id": userId } },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              totalListenTimeSec: { $sum: "$durationListenedSec" },
              sessionCount: { $sum: 1 },
              firstListenedAt: { $min: "$startedAt" },
              lastListenedAt: { $max: { $ifNull: ["$endedAt", "$startedAt"] } },
            },
          },
        ],
        trackCount: [
          { $group: { _id: "$contentHash" } },
          { $count: "count" },
        ],
        tracks: [
          {
            $group: {
              _id: "$contentHash",
              listenTimeSec: { $sum: "$durationListenedSec" },
              playCount: { $sum: 1 },
              lastPlayedAt: { $max: { $ifNull: ["$endedAt", "$startedAt"] } },
            },
          },
          { $sort: { listenTimeSec: -1 } },
          { $limit: 10 },
          {
            $project: {
              _id: 0,
              contentHash: "$_id",
              listenTimeSec: 1,
              playCount: 1,
              lastPlayedAt: 1,
            },
          },
        ],
      },
    },
  ];

  const [facet] = (await playbackSession
    .aggregation({ pipeline })
    .toArray()) as unknown as StatsFacet[];

  const totals = facet?.totals?.[0] ?? {};
  const trackCount = facet?.trackCount?.[0]?.count ?? 0;
  const tracks = facet?.tracks ?? [];

  return {
    totalListenTimeSec: totals.totalListenTimeSec ?? 0,
    sessionCount: totals.sessionCount ?? 0,
    trackCount,
    ...(totals.firstListenedAt !== undefined
      ? { firstListenedAt: totals.firstListenedAt }
      : {}),
    ...(totals.lastListenedAt !== undefined
      ? { lastListenedAt: totals.lastListenedAt }
      : {}),
    tracks,
  };
};
