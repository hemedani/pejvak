import { type ActFn, ObjectId } from "lesan";
import { annotation, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const deleteAnnotationFn: ActFn = async (body) => {
  const { set } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  const existing = await annotation.findOne({
    filters: { _id: new ObjectId(set.annotationId), "user._id": userId },
    projection: { _id: 1 },
  });
  if (!existing) {
    throwError("Annotation not found");
  }

  await annotation.deleteOne({ filter: { _id: existing!._id } });

  return { success: true };
};
