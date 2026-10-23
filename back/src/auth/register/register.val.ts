import { enums, object, optional, size, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { emailPattern } from "@model";

export const registerValidator = () =>
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
