import { enums, object, objectIdValidation, optional } from "lesan";

/** Deleting a folder takes its episodes with it. */
export const deleteChannelPlaylistValidator = () =>
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
