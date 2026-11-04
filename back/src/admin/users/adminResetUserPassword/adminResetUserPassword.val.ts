import {
  enums,
  object,
  objectIdValidation,
  optional,
  size,
  string,
} from "lesan";

export const adminResetUserPasswordValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      /** Omitted means "generate one and show it once to the operator". */
      password: optional(size(string(), 8, 100)),
    }),
    get: optional(
      object({
        userId: optional(enums([0, 1])),
        password: optional(enums([0, 1])),
        generated: optional(enums([0, 1])),
      }),
    ),
  });
