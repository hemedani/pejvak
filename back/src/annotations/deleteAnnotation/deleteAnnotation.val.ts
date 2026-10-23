import { enums, object, objectIdValidation, optional } from "lesan";

export const deleteAnnotationValidator = () =>
  object({
    set: object({
      annotationId: objectIdValidation,
    }),
    get: optional(
      object({
        success: optional(enums([0, 1])),
      }),
    ),
  });
