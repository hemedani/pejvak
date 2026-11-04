import { enums, object, optional } from "lesan";

export const getPlatformStatusValidator = () =>
  object({
    set: object({}),
    get: optional(
      object({
        signupsEnabled: optional(enums([0, 1])),
        aiEnabled: optional(enums([0, 1])),
        maintenanceMode: optional(enums([0, 1])),
        announcement: optional(enums([0, 1])),
      }),
    ),
  });
