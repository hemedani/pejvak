import { enums, object, optional, string } from "lesan";

export const adminRefundTransactionValidator = () =>
  object({
    set: object({
      reference: string(),
      reason: optional(string()),
    }),
    get: optional(
      object({
        refunded: optional(enums([0, 1])),
        reference: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        accessRevoked: optional(enums([0, 1])),
      }),
    ),
  });
