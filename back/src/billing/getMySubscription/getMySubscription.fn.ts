import { type ActFn, ObjectId } from "lesan";
import { plan } from "../../../mod.ts";
import { currentUser, pickByGet } from "@lib";
import {
  historyQuotaOf,
  resolveEntitlement,
} from "../../entitlements/entitlement.ts";

/**
 * The listener's own billing state — one call for the paywall and the account
 * page.
 *
 * `limits` and `history` are resolved live rather than read from the
 * subscription row, because the interesting numbers are "how much do I have
 * left?" and "what does my plan allow now?", and both can change without the
 * subscription changing (an admin edits the plan, or the listener syncs more).
 */
export const getMySubscriptionFn: ActFn = async (body) => {
  const user = currentUser();
  const userId = new ObjectId(user._id);

  const entitlement = await resolveEntitlement(userId);
  const history = await historyQuotaOf(userId, entitlement.limits);

  const planDoc = await plan.findOne({
    filters: { code: entitlement.planCode },
    projection: {
      priceCents: 1,
      currency: 1,
      billingInterval: 1,
      description: 1,
      features: 1,
    },
  });

  return pickByGet({
    planCode: entitlement.planCode,
    planTitle: entitlement.planTitle,
    isPaid: entitlement.isPaid,
    status: entitlement.subscriptionStatus,
    ...(entitlement.currentPeriodEnd !== undefined
      ? { currentPeriodEnd: entitlement.currentPeriodEnd }
      : {}),
    cancelAtPeriodEnd: entitlement.cancelAtPeriodEnd,
    autoRenew: entitlement.autoRenew,
    ...(entitlement.startedAt !== undefined
      ? { startedAt: entitlement.startedAt }
      : {}),
    ...(entitlement.grantMode !== undefined
      ? { grantMode: entitlement.grantMode }
      : {}),
    ...(entitlement.usageCaps !== undefined
      ? { usageCaps: entitlement.usageCaps }
      : {}),
    priceCents: planDoc?.priceCents ?? 0,
    currency: planDoc?.currency ?? "USD",
    billingInterval: planDoc?.billingInterval ?? "month",
    description: planDoc?.description,
    features: planDoc?.features ?? [],
    limits: entitlement.limits,
    history,
  }, body.details.get);
};
