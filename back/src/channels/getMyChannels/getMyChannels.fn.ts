import { type ActFn, type Document, ObjectId } from "lesan";
import { channel, coreApp } from "../../../mod.ts";
import { type MyContext, projectionOrPure } from "@lib";

/** The caller's channels, newest first. A bare array, like the other listener lists. */
export const getMyChannelsFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const {
    set: { page, limit, skip },
    get,
  } = body.details;

  const pipeline: Document[] = [
    { $match: { "user._id": new ObjectId(user._id) } },
    { $sort: { createdAt: -1 } },
  ];

  const calculatedSkip = skip ?? (limit || 50) * ((page || 1) - 1);
  pipeline.push({ $skip: calculatedSkip });
  pipeline.push({ $limit: limit || 50 });

  return await channel.aggregation({
    pipeline,
    projection: projectionOrPure(get, "channel"),
  }).toArray();
};
