import { type ActFn, type Document, ObjectId } from "lesan";
import { coreApp, playbackSession, track } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const getTrackSessionsFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const {
    set: { trackId, page, limit, skip },
    get,
  } = body.details;

  const userId = new ObjectId(user._id);
  const parentTrack = await track.findOne({
    filters: { _id: new ObjectId(trackId), "user._id": userId },
    projection: { _id: 1 },
  });
  if (!parentTrack) {
    return [];
  }

  const pipeline: Document[] = [
    { $match: { "user._id": userId, "track._id": parentTrack._id } },
    { $sort: { startedAt: -1 } },
  ];

  const calculatedSkip = skip ?? (limit || 50) * ((page || 1) - 1);
  pipeline.push({ $skip: calculatedSkip });
  pipeline.push({ $limit: limit || 50 });

  return await playbackSession
    .aggregation({ pipeline, projection: get })
    .toArray();
};
