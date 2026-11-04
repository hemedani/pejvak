import { enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../../mod.ts";
import { adminPagination } from "../../query.ts";

export const adminListSubscriptionsValidator = () =>
  object({
    set: object({
      ...adminPagination,
      status: optional(
        enums(["active", "trialing", "past_due", "canceled", "expired"]),
      ),
      planCode: optional(string()),
      /** Substring of the account's email or username. */
      search: optional(string()),
    }),
    get: optional(selectStruct("subscription", 1)),
  });
