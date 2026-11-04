import { number, object, optional, string } from "lesan";
import { selectStruct } from "../../../../mod.ts";
import { adminPagination } from "../../query.ts";

export const adminListAuditLogsValidator = () =>
  object({
    set: object({
      ...adminPagination,
      actorId: optional(string()),
      /** Exact match: the action names are a closed, dotted vocabulary. */
      action: optional(string()),
      targetType: optional(string()),
      targetId: optional(string()),
      from: optional(number()),
      to: optional(number()),
    }),
    get: optional(selectStruct("adminAuditLog", 1)),
  });
