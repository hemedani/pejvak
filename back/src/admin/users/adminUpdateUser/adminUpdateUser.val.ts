import { enums, object, objectIdValidation, optional, string } from "lesan";
import { emailPattern } from "@model";
import { safeUserStruct } from "../../query.ts";

export const adminUpdateUserValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      username: optional(string()),
      email: optional(emailPattern),
      displayName: optional(string()),
      avatarUrl: optional(string()),
      role: optional(enums(["user", "admin", "support"])),
      /**
       * `deleted` is not here on purpose: deletion has its own act, with its own
       * confirmation. A status field that can also delete is a footgun in a
       * dropdown.
       */
      status: optional(enums(["active", "suspended"])),
      suspendedReason: optional(string()),
    }),
    get: optional(safeUserStruct()),
  });
