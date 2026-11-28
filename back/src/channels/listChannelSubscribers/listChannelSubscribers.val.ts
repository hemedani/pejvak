import { enums, object, objectIdValidation, optional } from "lesan";
import { pagination } from "@lib";

/**
 * The subscribers of one channel, newest follow first.
 *
 * Operator + owner only (the act's query enforces the owner; `canReadAll`
 * covers support). `get` is an allow-list of the four identity fields a
 * subscriber list may expose — never `email`, `setting`, `role` or `status`.
 */
const subscriberStruct = object({
  _id: optional(enums([0, 1])),
  username: optional(enums([0, 1])),
  displayName: optional(enums([0, 1])),
  avatarUrl: optional(enums([0, 1])),
});

export const listChannelSubscribersValidator = () =>
  object({
    set: object({
      channelId: objectIdValidation,
      ...pagination,
    }),
    get: optional(subscriberStruct),
  });
