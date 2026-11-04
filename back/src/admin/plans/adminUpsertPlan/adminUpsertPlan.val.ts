import { array, boolean, enums, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../../mod.ts";

export const adminUpsertPlanValidator = () =>
  object({
    set: object({
      code: string(),
      title: optional(string()),
      description: optional(string()),
      priceCents: optional(number()),
      currency: optional(string()),
      billingInterval: optional(enums(["month", "year", "lifetime"])),
      isActive: optional(boolean()),
      isDefault: optional(boolean()),
      sortOrder: optional(number()),
      /**
       * Partial on purpose: an operator changing the price must not have to
       * resend every limit, and a limit that is not sent keeps its value.
       */
      limits: optional(
        object({
          historyEntries: optional(number()),
          crossDeviceSync: optional(boolean()),
          playlists: optional(number()),
          maxTracks: optional(number()),
          aiCreditsPerMonth: optional(number()),
        }),
      ),
      features: optional(array(string())),
    }),
    get: optional(selectStruct("plan", 1)),
  });
