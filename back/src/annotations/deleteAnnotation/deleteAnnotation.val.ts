import { boolean, object, string } from "lesan";

export const deleteAnnotationValidator = () =>
  object({
    set: object({
      annotationId: string(),
    }),
    get: object({
      success: boolean(),
    }),
  });
