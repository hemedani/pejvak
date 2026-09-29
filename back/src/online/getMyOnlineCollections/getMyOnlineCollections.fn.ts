import { type ActFn, type Document, ObjectId } from "lesan";
import { coreApp, onlineCollection } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const getMyOnlineCollectionsFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const {
    set: {
      page,
      limit,
      skip,
      isFavorite,
      sourceId,
      languageCode,
      sortBy,
      sortOrder,
    },
    get,
  } = body.details;

  const pipeline: Document[] = [
    { $match: { "user._id": new ObjectId(user._id) } },
    // A tombstone is a pending removal, not a collection. It is filtered here
    // rather than deleted on arrival so the device that made it can be told the
    // removal was acknowledged.
    { $match: { deletedAt: null } },
  ];

  if (isFavorite !== undefined) {
    pipeline.push({ $match: { isFavorite } });
  }
  if (sourceId !== undefined) {
    pipeline.push({ $match: { sourceId } });
  }
  if (languageCode !== undefined) {
    pipeline.push({ $match: { languageCode } });
  }

  const sortField = sortBy || "updatedAt";
  const sortDirection = sortOrder === "asc" ? 1 : -1;
  pipeline.push({ $sort: { [sortField]: sortDirection } });

  const calculatedSkip = skip ?? (limit || 50) * ((page || 1) - 1);
  pipeline.push({ $skip: calculatedSkip });
  pipeline.push({ $limit: limit || 50 });

  return await onlineCollection
    .aggregation({ pipeline, projection: get })
    .toArray();
};
