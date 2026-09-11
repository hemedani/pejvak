import { type ActFn, type Document, ObjectId } from "lesan";
import { annotation, coreApp } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const getMyAnnotationsFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const {
    set: { page, limit, skip },
    get,
  } = body.details;

  const pipeline: Document[] = [
    { $match: { "user._id": new ObjectId(user._id) } },
    { $sort: { updatedAt: -1 } },
  ];

  const calculatedSkip = skip ?? (limit || 50) * ((page || 1) - 1);
  pipeline.push({ $skip: calculatedSkip });
  pipeline.push({ $limit: limit || 50 });

  return await annotation.aggregation({ pipeline, projection: get }).toArray();
};
