import { enums, object, optional } from "lesan";

export const adminGetPlatformSettingValidator = () =>
  object({
    set: object({}),
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
