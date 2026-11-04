import { enums, object, objectIdValidation, optional, string } from "lesan";

export const adminDeleteUserValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      /**
       * Typed by the operator, matched against the account's email.
       *
       * A destructive act with an irreversible result should not be one
       * mis-click away, and a confirmation dialog the client draws is not a
       * guard: the API has to refuse the call that skipped it.
       */
      confirmEmail: string(),
    }),
    get: optional(
      object({
        deleted: optional(enums([0, 1])),
        userId: optional(enums([0, 1])),
        purged: optional(enums([0, 1])),
      }),
    ),
  });
