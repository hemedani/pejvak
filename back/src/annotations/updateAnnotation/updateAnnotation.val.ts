import { array, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

export const updateAnnotationValidator = () =>
  object({
    set: object({
      annotationId: string(),
      text: optional(string()),
      tags: optional(array(string())),
      color: optional(string()),
      updatedAt: optional(number()),
    }),
    get: selectStruct("annotation", 1),
  });
