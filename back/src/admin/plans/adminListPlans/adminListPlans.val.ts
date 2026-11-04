import { boolean, enums, object, optional } from "lesan";

export const adminListPlansValidator = () =>
  object({
    set: object({
      /** Archived plans are hidden by default; the editor asks for them. */
      includeInactive: optional(boolean()),
    }),
    get: optional(
      object({
        _id: optional(enums([0, 1])),
        code: optional(enums([0, 1])),
        title: optional(enums([0, 1])),
        description: optional(enums([0, 1])),
        priceCents: optional(enums([0, 1])),
        currency: optional(enums([0, 1])),
        billingInterval: optional(enums([0, 1])),
        isActive: optional(enums([0, 1])),
        isDefault: optional(enums([0, 1])),
        sortOrder: optional(enums([0, 1])),
        limits: optional(enums([0, 1])),
        features: optional(enums([0, 1])),
        createdAt: optional(enums([0, 1])),
        updatedAt: optional(enums([0, 1])),
        /** Live subscriber count, computed at read time. */
        subscribers: optional(enums([0, 1])),
      }),
    ),
  });
