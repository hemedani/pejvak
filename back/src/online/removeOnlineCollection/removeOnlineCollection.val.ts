import { object, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

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
    get: selectStruct("onlineCollection", 1),
  });
