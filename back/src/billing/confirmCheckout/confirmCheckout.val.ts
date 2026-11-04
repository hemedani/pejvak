import { enums, object, optional, string } from "lesan";

export const confirmCheckoutValidator = () =>
  object({
    set: object({
      reference: string(),
    }),
    get: optional(
      object({
        reference: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        alreadyProcessed: optional(enums([0, 1])),
        planCode: optional(enums([0, 1])),
        awaitingConfirmation: optional(enums([0, 1])),
        periodStart: optional(enums([0, 1])),
        periodEnd: optional(enums([0, 1])),
      }),
    ),
  });
