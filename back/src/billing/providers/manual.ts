import type { BillingProvider, CheckoutRequest } from "./types.ts";

/**
 * The provider that needs no integration.
 *
 * It is the default on purpose. A deployment with no payment keys still has to
 * be able to sell a subscription — a bank transfer, a card-to-card payment, a
 * gateway whose callback is wired outside this service — and the honest way to
 * model that is a pending transaction an operator confirms, not a fake success.
 *
 * `verify` always reports "not paid": only a human can say the money arrived.
 */
export const manualProvider: BillingProvider = {
  name: "manual",
  createCheckout: (request: CheckoutRequest) =>
    Promise.resolve({
      provider: "manual",
      status: "manual" as const,
      instructions:
        `Complete the payment of ${(request.amountCents / 100).toFixed(2)} ` +
        `${request.currency} for ${request.planTitle}, then quote reference ` +
        `${request.reference}. Your plan activates as soon as it is confirmed.`,
    }),
  verify: () => Promise.resolve({ paid: false }),
};
