import { type ActFn, ObjectId } from "lesan";
import { annotation, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const updateAnnotationFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  const existing = await annotation.findOne({
    filters: { _id: new ObjectId(set.annotationId), "user._id": userId },
    projection: { _id: 1, updatedAt: 1 },
  });
  if (!existing) {
    throwError("Annotation not found");
  }

  const incomingUpdatedAt = set.updatedAt ?? Date.now();
  const existingUpdatedAt = existing!.updatedAt
    ? new Date(existing!.updatedAt).getTime()
    : 0;

  // Last-write-wins: an older edit never overwrites a newer stored one.
  if (incomingUpdatedAt > existingUpdatedAt) {
    await annotation.findOneAndUpdate({
      filter: { _id: existing!._id },
      update: {
        $set: {
          ...(set.text !== undefined ? { text: set.text } : {}),
          ...(set.tags !== undefined ? { tags: set.tags } : {}),
          ...(set.color !== undefined ? { color: set.color } : {}),
          updatedAt: new Date(incomingUpdatedAt),
        },
      },
      projection: { _id: 1 },
    });
  }

  return await annotation.findOne({
    filters: { _id: existing!._id },
    projection: get,
  });
};
