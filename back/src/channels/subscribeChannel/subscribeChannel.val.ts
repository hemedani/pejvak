import { enums, object, objectIdValidation, optional } from "lesan";

/**
 * Following a channel.
 *
 * The client names the channel only; the subscriber is the caller, derived from
 * the token. `subscriberCount` is a computed column merged in after the write so
 * the account page can update its number without a second read.
 */
export const subscribeChannelValidator = () =>
  object({
    set: object({ channelId: objectIdValidation }),
    get: optional(
      object({
        subscribed: optional(enums([0, 1])),
        subscriberCount: optional(enums([0, 1])),
      }),
    ),
  });
