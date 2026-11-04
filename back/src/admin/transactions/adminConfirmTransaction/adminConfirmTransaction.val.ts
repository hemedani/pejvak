import { enums, object, optional, string } from "lesan";

export const adminConfirmTransactionValidator = () =>
  object({
    set: object({
      reference: string(),
      note: optional(string()),
    }),
    get: optional(
      object({
        reference: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        alreadyProcessed: optional(enums([0, 1])),
        planCode: optional(enums([0, 1])),
        periodStart: optional(enums([0, 1])),
        periodEnd: optional(enums([0, 1])),
      }),
    ),
  });
