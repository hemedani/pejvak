import { type ActFn, type Document, ObjectId } from "lesan";
import { coreApp, playbackContext } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const getMyPlaybackContextsFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const {
    set: { page, limit, skip, contextType, contextKey },
    get,
  } = body.details;

  const pipeline: Document[] = [
    { $match: { "user._id": new ObjectId(user._id) } },
  ];

  if (contextType !== undefined || contextKey !== undefined) {
    const filter: Record<string, string> = {};
    if (contextType !== undefined) filter.contextType = contextType;
    if (contextKey !== undefined) filter.contextKey = contextKey;
    pipeline.push({ $match: filter });
  }

  pipeline.push({ $sort: { startedAt: -1 } });

  const calculatedSkip = skip ?? (limit || 50) * ((page || 1) - 1);
  pipeline.push({ $skip: calculatedSkip });
  pipeline.push({ $limit: limit || 50 });

  return await playbackContext.aggregation({ pipeline, projection: get })
    .toArray();
};
