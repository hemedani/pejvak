import { enums, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../../mod.ts";
import { adminPagination } from "../../query.ts";

export const adminListTransactionsValidator = () =>
  object({
    set: object({
      ...adminPagination,
      status: optional(
        enums(["pending", "paid", "failed", "refunded", "canceled"]),
      ),
      provider: optional(string()),
      planCode: optional(string()),
      /** Owner as a string — transactions are not related to `User`. */
      userId: optional(string()),
      search: optional(string()),
      from: optional(number()),
      to: optional(number()),
    }),
    get: optional(
      selectStruct("billingTransaction", 1, ["metadata"]),
    ),
  });
