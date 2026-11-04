import { enums, object, optional } from "lesan";

/**
 * No fields: a listener can only stop renewal, not surrender paid time. An
 * immediate end is an admin action (`adminRevokeSubscription`), because it is
 * either a refund decision or an abuse decision, and neither is the listener's
 * to make.
 */
export const cancelMySubscriptionValidator = () =>
  object({
    set: object({}),
    get: optional(
      object({
        canceled: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        cancelAtPeriodEnd: optional(enums([0, 1])),
        currentPeriodEnd: optional(enums([0, 1])),
        planCode: optional(enums([0, 1])),
      }),
    ),
  });
