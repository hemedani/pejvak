import { type ActFn, ObjectId } from "lesan";
import { currentUser, pickByGet, throwError } from "@lib";
import { resolveEntitlement } from "../../entitlements/entitlement.ts";
import { revokeSubscription } from "../lifecycle.ts";

/**
 * Stops the next renewal and keeps the days already paid for.
 *
 * The subscription row stays `active` until the period ends; `cancelAtPeriodEnd`
 * is what changes. That is the honest state: access continues, and the account
 * page can say "Pro until 3 Dec, then Free" instead of flipping to Free today
 * and taking away time the listener paid for.
 *
 * "Is there a subscription" rather than "is it paid": a comped tier has a price
 * of 0 and still auto-renews in the model, so a listener on one must be able to
 * stop it — otherwise the only way off it is an admin.
 */
export const cancelMySubscriptionFn: ActFn = async (body) => {
  const user = currentUser();
  const userId = new ObjectId(user._id);

  const entitlement = await resolveEntitlement(userId);

  const running = entitlement.subscriptionStatus === "active" ||
    entitlement.subscriptionStatus === "trialing" ||
    entitlement.subscriptionStatus === "past_due";

  if (!running) {
    throwError("You do not have an active subscription");
  }

  await revokeSubscription(userId, { immediate: false });

  const updated = await resolveEntitlement(userId);

  return pickByGet({
    canceled: true,
    status: updated.subscriptionStatus,
    cancelAtPeriodEnd: updated.cancelAtPeriodEnd,
    ...(updated.currentPeriodEnd !== undefined
      ? { currentPeriodEnd: updated.currentPeriodEnd }
      : {}),
    planCode: updated.planCode,
  }, body.details.get);
};
