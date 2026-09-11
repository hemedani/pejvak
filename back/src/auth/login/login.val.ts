import { enums, object, optional, size, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { emailPattern } from "@model";

export const loginValidator = () =>
  object({
    set: object({
      email: emailPattern,
      password: size(string(), 8, 100),
    }),
    get: optional(
      object({
        token: optional(enums([0, 1])),
        user: selectStruct("user", 1),
      }),
    ),
  });
