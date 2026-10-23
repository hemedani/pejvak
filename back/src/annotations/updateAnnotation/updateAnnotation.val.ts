import {
  array,
  number,
  object,
  objectIdValidation,
  optional,
  string,
} from "lesan";
import { selectStruct } from "../../../mod.ts";

export const updateAnnotationValidator = () =>
  object({
    set: object({
      annotationId: objectIdValidation,
      text: optional(string()),
      tags: optional(array(string())),
      color: optional(string()),
      updatedAt: optional(number()),
    }),
    get: selectStruct("annotation", 1),
  });
