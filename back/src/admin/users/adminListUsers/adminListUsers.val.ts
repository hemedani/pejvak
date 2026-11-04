import { enums, object, optional, string } from "lesan";
import { adminPagination, safeUserStruct } from "../../query.ts";

export const adminListUsersValidator = () =>
  object({
    set: object({
      ...adminPagination,
      /** Substring of username, email or display name. Escaped before use. */
      search: optional(string()),
      role: optional(enums(["user", "admin", "support"])),
      status: optional(enums(["active", "suspended", "deleted"])),
      /**
       * Narrows to a plan. `free` means "no active subscription" rather than
       * "a row that says free", because the free tier has no row at all.
       */
      planCode: optional(string()),
      sortBy: optional(
        enums(["createdAt", "updatedAt", "email", "username", "displayName"]),
      ),
      sortOrder: optional(enums(["asc", "desc"])),
    }),
    get: optional(safeUserStruct()),
  });
