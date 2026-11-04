import { type ActFn, ObjectId } from "lesan";
import { user } from "../../../../mod.ts";
import { pickByGet, throwError } from "@lib";
import { revokeSubscription } from "../../../billing/lifecycle.ts";
import { resolveEntitlement } from "../../../entitlements/entitlement.ts";
import { recordAudit } from "../../audit.ts";

/**
 * Ends a subscription now — the refund and abuse path.
 *
 * Different from the listener's own cancel, which keeps the paid days: this
 * writes `currentPeriodEnd` to the present, so the very next sync sees the free
 * tier's cap. The row is kept, not deleted, so "why did this person lose Pro?"
 * still has an answer in the panel.
 *
 * The guard is "is there a subscription row still running", not "is it paid".
 * A comped tier (a trial, a student plan, a zero-price grant) has a price of 0
 * and is exactly the thing an operator most often needs to take back; refusing
 * because nobody was charged would leave those accounts stuck on a plan with no
 * way off it except deleting the listener.
 */
export const adminRevokeSubscriptionFn: ActFn = async (body) => {
  const { set } = body.details;
  const userId = new ObjectId(set.userId);

  const target = await user.findOne({
    filters: { _id: userId },
    projection: { _id: 1, email: 1 },
  });
  if (!target) throwError("User not found");

  const before = await resolveEntitlement(userId);

  const running = before.subscriptionStatus === "active" ||
    before.subscriptionStatus === "trialing" ||
    before.subscriptionStatus === "past_due";

  if (!running) {
    throwError("This account has no active subscription to revoke");
  }

  await revokeSubscription(userId, { immediate: true });

  const after = await resolveEntitlement(userId);

  await recordAudit({
    action: "subscription.revoke",
    targetType: "subscription",
    targetId: String(userId),
    summary: `Revoked ${before.planTitle} from ${target!.email}`,
    metadata: {
      planCode: before.planCode,
      reason: set.reason ?? null,
      previousPeriodEnd: before.currentPeriodEnd ?? null,
    },
  });

  return pickByGet({
    revoked: true,
    planCode: after.planCode,
    status: after.subscriptionStatus,
    limits: after.limits,
  }, body.details.get);
};
