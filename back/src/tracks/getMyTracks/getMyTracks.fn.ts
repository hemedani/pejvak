import { type ActFn, type Document, ObjectId } from "lesan";
import { coreApp, track } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const getMyTracksFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;

  const {
    set: { page, limit, skip, isAudiobook, search, sortBy, sortOrder },
    get,
  } = body.details;

  const pipeline: Document[] = [
    { $match: { "user._id": new ObjectId(user._id) } },
  ];

  if (isAudiobook !== undefined) {
    pipeline.push({ $match: { isAudiobook } });
  }

  if (search) {
    pipeline.push({
      $match: {
        $or: [
          { title: { $regex: search, $options: "i" } },
          { author: { $regex: search, $options: "i" } },
          { narrator: { $regex: search, $options: "i" } },
        ],
      },
    });
  }

  const sortField = sortBy || "_id";
  const sortDirection = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortField]: sortDirection } });

  const calculatedSkip = skip ?? (limit || 50) * ((page || 1) - 1);
  pipeline.push({ $skip: calculatedSkip });
  pipeline.push({ $limit: limit || 50 });

  return await track
    .aggregation({
      pipeline,
      projection: get,
    })
    .toArray();
};
