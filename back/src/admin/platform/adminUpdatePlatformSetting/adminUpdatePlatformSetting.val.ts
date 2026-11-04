import { boolean, enums, object, optional, string } from "lesan";

export const adminUpdatePlatformSettingValidator = () =>
  object({
    set: object({
      signupsEnabled: optional(boolean()),
      aiEnabled: optional(boolean()),
      maintenanceMode: optional(boolean()),
      announcement: optional(string()),
    }),
    get: optional(
      object({
        key: optional(enums([0, 1])),
        signupsEnabled: optional(enums([0, 1])),
        aiEnabled: optional(enums([0, 1])),
        maintenanceMode: optional(enums([0, 1])),
        announcement: optional(enums([0, 1])),
      }),
    ),
  });
