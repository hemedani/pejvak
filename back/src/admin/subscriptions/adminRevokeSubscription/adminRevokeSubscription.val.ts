import { enums, object, objectIdValidation, optional, string } from "lesan";
import { limitsProjection } from "../../../entitlements/structs.ts";

export const adminRevokeSubscriptionValidator = () =>
  object({
    set: object({
      userId: objectIdValidation,
      reason: optional(string()),
    }),
    get: optional(
      object({
        revoked: optional(enums([0, 1])),
        planCode: optional(enums([0, 1])),
        status: optional(enums([0, 1])),
        limits: optional(limitsProjection()),
      }),
    ),
  });
