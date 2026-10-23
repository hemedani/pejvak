import { enums, object, optional, string } from "lesan";

/**
 * Identified by the source's own ids, like `saveOnlineCollection` — the client
 * never sends the derived key, so the two acts cannot disagree about which
 * collection is being named.
 */
export const removeOnlineCollectionValidator = () =>
  object({
    set: object({
      sourceId: string(),
      externalId: string(),
    }),
    get: optional(
      object({
        success: optional(enums([0, 1])),
      }),
    ),
  });
