import { cancelMySubscriptionSetup } from "./cancelMySubscription/mod.ts";
import { confirmCheckoutSetup } from "./confirmCheckout/mod.ts";
import { createCheckoutSetup } from "./createCheckout/mod.ts";
import { getMySubscriptionSetup } from "./getMySubscription/mod.ts";

export const billingSetup = () => {
  getMySubscriptionSetup();
  createCheckoutSetup();
  confirmCheckoutSetup();
  cancelMySubscriptionSetup();
};
