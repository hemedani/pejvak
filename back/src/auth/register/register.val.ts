import { enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { emailPattern } from "@model";

export const registerValidator = () =>
  object({
    set: object({
      username: string(),
      email: emailPattern,
      password: string(),
      displayName: optional(string()),
    }),
    get: object({
      token: enums([0, 1]),
      user: selectStruct("user", 1),
    }),
  });
