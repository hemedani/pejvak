import { type ActFn } from "lesan";
import { billingTransaction } from "../../../mod.ts";
import { currentUser, pickByGet, throwError } from "@lib";
import { completeTransaction } from "../lifecycle.ts";
import { getProvider } from "../providers/index.ts";

/**
 * Asks the provider whether a checkout was paid, and activates it if so.
 *
 * The listener returning from a payment page is a *claim*, not proof: the
 * browser can be told to open `success_url` by anyone. So the answer comes from
 * the provider's API, keyed by our reference — never from the query string.
 *
 * Calling this twice is safe: `completeTransaction` claims the transaction
 * atomically, so the second call reports `alreadyProcessed` and does not extend
 * the period again.
 */
export const confirmCheckoutFn: ActFn = async (body) => {
  const user = currentUser();
  const { reference } = body.details.set;

  const transaction = await billingTransaction.findOne({
    filters: { reference, userId: String(user._id) },
    projection: {
      reference: 1,
      status: 1,
      provider: 1,
      providerRef: 1,
      planCode: 1,
    },
  });

  if (!transaction) throwError("Transaction not found");

  if (transaction!.status === "paid") {
    return {
      reference,
      status: "paid",
      alreadyProcessed: true,
      planCode: transaction!.planCode,
    };
  }

  const provider = getProvider(transaction!.provider);
  const verification = await provider.verify(
    reference,
    transaction!.providerRef,
  );

  if (!verification.paid) {
    return pickByGet({
      reference,
      status: transaction!.status ?? "pending",
      alreadyProcessed: false,
      planCode: transaction!.planCode,
      awaitingConfirmation: true,
    }, body.details.get);
  }

  const completion = await completeTransaction(reference, {
    ...(verification.providerRef !== undefined
      ? { providerRef: verification.providerRef }
      : {}),
    ...(verification.metadata !== undefined
      ? { metadata: verification.metadata }
      : {}),
  });

  return pickByGet({
    reference,
    status: completion.status,
    alreadyProcessed: completion.alreadyProcessed,
    planCode: completion.activation?.planCode ?? transaction!.planCode,
    ...(completion.activation
      ? {
        periodStart: completion.activation.periodStart,
        ...(completion.activation.periodEnd !== undefined
          ? { periodEnd: completion.activation.periodEnd }
          : {}),
      }
      : {}),
  }, body.details.get);
};
