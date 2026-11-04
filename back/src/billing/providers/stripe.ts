import type { BillingProvider, CheckoutRequest } from "./types.ts";
import { throwError } from "@lib";

const API = "https://api.stripe.com/v1";

const secretKey = (): string => {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) {
    throwError(
      "Card payments are not available right now. Choose the manual payment method.",
    );
  }
  return key as string;
};

type StripeSession = {
  id?: string;
  url?: string;
  payment_status?: string;
  status?: string;
  amount_total?: number;
  currency?: string;
  client_reference_id?: string;
  error?: { message?: string };
};

/**
 * Card payments, modelled as a **one-off payment per billing period**.
 *
 * Not a Stripe Subscription on purpose. The entitlement lives in our
 * `subscription` collection, so the money and the access are separate facts:
 * Stripe collects, this backend decides what the listener may do. That keeps
 * one source of truth, makes a manual grant and a card payment produce the same
 * row, and means a webhook outage cannot lock someone out of what they paid for.
 *
 * The session is created server-side (the price never comes from the client)
 * and confirmed server-side by `confirmCheckout`, which re-reads the session
 * from Stripe rather than trusting the browser's redirect. That is also why no
 * webhook endpoint is needed: a `success_url` return is enough, and a listener
 * who closes the tab is confirmed by the admin or on the next attempt.
 */
export const stripeProvider: BillingProvider = {
  name: "stripe",
  createCheckout: async (request: CheckoutRequest) => {
    const key = secretKey();

    const successUrl = request.successUrl ??
      Deno.env.get("BILLING_SUCCESS_URL") ?? "";
    const cancelUrl = request.cancelUrl ?? Deno.env.get("BILLING_CANCEL_URL") ??
      "";

    if (!successUrl || !cancelUrl) {
      throwError(
        "BILLING_SUCCESS_URL and BILLING_CANCEL_URL must be set to use card payments",
      );
    }

    const body = new URLSearchParams({
      mode: "payment",
      client_reference_id: request.reference,
      success_url: successUrl,
      cancel_url: cancelUrl,
      "line_items[0][quantity]": "1",
      "line_items[0][price_data][currency]": request.currency.toLowerCase(),
      "line_items[0][price_data][unit_amount]": String(request.amountCents),
      "line_items[0][price_data][product_data][name]":
        `${request.planTitle} (${request.interval})`,
    });

    const response = await fetch(`${API}/checkout/sessions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
    });

    const session = (await response.json()) as StripeSession;

    if (!response.ok || !session.url || !session.id) {
      throwError(
        session.error?.message ?? "The payment session could not be created",
      );
    }

    return {
      provider: "stripe",
      status: "redirect" as const,
      checkoutUrl: session.url,
      providerRef: session.id,
    };
  },
  verify: async (reference: string, providerRef?: string) => {
    const key = secretKey();

    if (!providerRef) {
      throwError("This checkout has no payment session to confirm");
    }

    const response = await fetch(`${API}/checkout/sessions/${providerRef}`, {
      headers: { Authorization: `Bearer ${key}` },
    });

    const session = (await response.json()) as StripeSession;

    if (!response.ok) {
      throwError(session.error?.message ?? "The payment could not be verified");
    }

    // A session id is guessable enough that the reference has to match too:
    // otherwise one listener could confirm another listener's payment.
    const paid = session.payment_status === "paid" &&
      session.client_reference_id === reference;

    return {
      paid,
      providerRef: session.id,
      ...(session.amount_total !== undefined
        ? { amountCents: session.amount_total }
        : {}),
      metadata: {
        sessionId: session.id,
        paymentStatus: session.payment_status,
        status: session.status,
        currency: session.currency,
      },
    };
  },
};
