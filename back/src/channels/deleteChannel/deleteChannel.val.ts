import { enums, object, objectIdValidation, optional, string } from "lesan";

/**
 * Deleting a channel takes its folders and episodes with it.
 *
 * `confirmName` is required only when an operator deletes a channel they do not
 * own (the fn checks ownership); a creator needs nothing to remove their own.
 */
export const deleteChannelValidator = () =>
  object({
    set: object({
      channelId: objectIdValidation,
      confirmName: optional(string()),
    }),
    get: optional(
      object({
        success: optional(enums([0, 1])),
      }),
    ),
  });
