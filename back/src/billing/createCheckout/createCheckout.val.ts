import { enums, object, optional, string } from "lesan";

export const createCheckoutValidator = () =>
  object({
    set: object({
      planCode: string(),
      /**
       * Omitted means "use `BILLING_PROVIDER`, else manual". The client may ask
       * for a specific method only when it is offering a choice.
       */
      provider: optional(enums(["manual", "stripe"])),
      successUrl: optional(string()),
      cancelUrl: optional(string()),
    }),
    get: optional(
      object({
        reference: optional(enums([0, 1])),
        provider: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        checkoutUrl: optional(enums([0, 1])),
        instructions: optional(enums([0, 1])),
        amountCents: optional(enums([0, 1])),
        currency: optional(enums([0, 1])),
        planCode: optional(enums([0, 1])),
        planTitle: optional(enums([0, 1])),
      }),
    ),
  });
