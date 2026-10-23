import { enums, object, objectIdValidation, optional } from "lesan";

export const deletePlaylistValidator = () =>
  object({
    set: object({
      playlistId: objectIdValidation,
    }),
    get: optional(
      object({
        success: optional(enums([0, 1])),
      }),
    ),
  });
