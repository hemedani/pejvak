/**
 * The shape every payment provider adapter has to satisfy.
 *
 * The point of the interface is that `createCheckout` and `confirmCheckout` —
 * the two acts the clients call — know nothing about Stripe, a bank transfer or
 * whatever comes next. A provider may only:
 *
 * - turn our reference into something the listener can pay (`createCheckout`);
 * - answer "did this reference get paid?" (`verify`).
 *
 * Everything about entitlement lives in `lifecycle.ts`, so a new provider
 * cannot invent its own idea of when a subscription starts.
 */
export type CheckoutRequest = {
  reference: string;
  planCode: string;
  planTitle: string;
  amountCents: number;
  currency: string;
  interval: string;
  userEmail?: string;
  successUrl?: string;
  cancelUrl?: string;
};

export type CheckoutResult = {
  provider: string;
  /**
   * `redirect` — send the listener to `checkoutUrl`.
   * `manual` — show `instructions` and wait for a confirmation.
   */
  status: "redirect" | "manual";
  checkoutUrl?: string;
  providerRef?: string;
  instructions?: string;
};

export type VerificationResult = {
  paid: boolean;
  providerRef?: string;
  amountCents?: number;
  /** Stored verbatim on the transaction, for disputes. */
  metadata?: Record<string, unknown>;
};

export interface BillingProvider {
  name: string;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  verify(reference: string, providerRef?: string): Promise<VerificationResult>;
}
