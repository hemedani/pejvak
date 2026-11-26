import { enums, object, optional, size, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { emailPattern } from "@model";

/**
 * The same shape as `register`, because the first admin is still a user row.
 * `role` is not in `set`: the act writes `admin` itself, so a caller cannot
 * choose it (and there is no way to ask for `support` here either).
 */
export const createFirstAdminValidator = () =>
  object({
    set: object({
      username: string(),
      email: emailPattern,
      password: size(string(), 8, 100),
      displayName: optional(string()),
    }),
    get: optional(
      object({
        token: optional(enums([0, 1])),
        user: optional(selectStruct("user", 1)),
      }),
    ),
  });
