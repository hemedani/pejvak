import { enums, object, objectIdValidation, optional } from "lesan";

/** Deletes one episode and reclaims its bytes. */
export const deleteChannelAudioValidator = () =>
  object({
    set: object({
      audioId: objectIdValidation,
    }),
    get: optional(
      object({
        success: optional(enums([0, 1])),
      }),
    ),
  });
