import { enums, object, objectIdValidation, optional } from "lesan";

/**
 * Unfollowing a channel.
 *
 * Idempotent: an absent subscription is a success with the current count, so a
 * retried request after a dropped response is not an error.
 */
export const unsubscribeChannelValidator = () =>
  object({
    set: object({ channelId: objectIdValidation }),
    get: optional(
      object({
        subscribed: optional(enums([0, 1])),
        subscriberCount: optional(enums([0, 1])),
      }),
    ),
  });
