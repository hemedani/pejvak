import { type ActFn, ObjectId } from "lesan";
import { billingTransaction, plan } from "../../../mod.ts";
import { currentUser, pickByGet, throwError } from "@lib";
import { resolveEntitlement } from "../../entitlements/entitlement.ts";
import { createPendingTransaction, intervalOf } from "../lifecycle.ts";
import { getProvider } from "../providers/index.ts";

/**
 * Starts a purchase.
 *
 * The price comes from the plan row, never from the request, and the amount is
 * copied onto the transaction at this moment so a later reprice cannot change
 * what this listener is being asked to pay.
 *
 * A listener who already has the same plan active is refused rather than
 * silently charged twice. Renewals are not a purchase path here: a manual
 * renewal goes through support, and a card renewal goes through the provider's
 * own recurring flow once one exists.
 */
export const createCheckoutFn: ActFn = async (body) => {
  const user = currentUser();
  const userId = new ObjectId(user._id);
  const { planCode, provider: requestedProvider, successUrl, cancelUrl } =
    body.details.set;

  const foundPlan = await plan.findOne({
    filters: { code: planCode },
    projection: {
      code: 1,
      title: 1,
      priceCents: 1,
      currency: 1,
      billingInterval: 1,
      isActive: 1,
    },
  });

  if (!foundPlan) throwError("That plan does not exist");
  if (foundPlan!.isActive === false) {
    throwError("That plan is no longer available");
  }
  if ((foundPlan!.priceCents ?? 0) <= 0) {
    throwError("That plan is free and needs no purchase");
  }

  const entitlement = await resolveEntitlement(userId);
  if (entitlement.isPaid && entitlement.planCode === planCode) {
    throwError(
      "You already have this plan. Cancel it before buying it again.",
    );
  }

  const provider = getProvider(requestedProvider);
  const interval = intervalOf(foundPlan!.billingInterval);

  const { reference } = await createPendingTransaction({
    userId,
    userEmail: user.email,
    planCode: foundPlan!.code,
    planTitle: foundPlan!.title,
    amountCents: foundPlan!.priceCents ?? 0,
    currency: foundPlan!.currency ?? "USD",
    interval,
    provider: provider.name,
  });

  const checkout = await provider.createCheckout({
    reference,
    planCode: foundPlan!.code,
    planTitle: foundPlan!.title,
    amountCents: foundPlan!.priceCents ?? 0,
    currency: foundPlan!.currency ?? "USD",
    interval,
    ...(user.email !== undefined ? { userEmail: user.email } : {}),
    ...(successUrl !== undefined ? { successUrl } : {}),
    ...(cancelUrl !== undefined ? { cancelUrl } : {}),
  });

  if (checkout.providerRef !== undefined) {
    await billingTransaction.findOneAndUpdate({
      filter: { reference },
      update: {
        $set: { providerRef: checkout.providerRef, updatedAt: new Date() },
      },
      projection: { _id: 1 },
    });
  }

  return pickByGet({
    reference,
    provider: checkout.provider,
    status: checkout.status,
    ...(checkout.checkoutUrl !== undefined
      ? { checkoutUrl: checkout.checkoutUrl }
      : {}),
    ...(checkout.instructions !== undefined
      ? { instructions: checkout.instructions }
      : {}),
    amountCents: foundPlan!.priceCents ?? 0,
    currency: foundPlan!.currency ?? "USD",
    planCode: foundPlan!.code,
    planTitle: foundPlan!.title,
  }, body.details.get);
};
