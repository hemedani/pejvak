import type { BillingProvider } from "./types.ts";
import { manualProvider } from "./manual.ts";
import { stripeProvider } from "./stripe.ts";
import { throwError } from "@lib";

export * from "./types.ts";
export { manualProvider } from "./manual.ts";
export { stripeProvider } from "./stripe.ts";

const registry: Record<string, BillingProvider> = {
  manual: manualProvider,
  stripe: stripeProvider,
};

export const providerNames = Object.keys(registry);

/**
 * Resolves a provider by request, then by `BILLING_PROVIDER`, then to manual.
 *
 * Defaulting to manual is the safe direction: a misconfigured deployment ends
 * up asking for a bank transfer, not collecting card details it cannot charge.
 */
export const getProvider = (name?: string): BillingProvider => {
  const key = name ?? Deno.env.get("BILLING_PROVIDER") ?? "manual";
  const provider = registry[key];

  if (!provider) {
    throwError(`Unknown payment provider: ${key}`);
  }

  return provider;
};
