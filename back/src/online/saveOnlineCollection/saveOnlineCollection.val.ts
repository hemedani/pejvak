import { boolean, defaulted, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * Saving a collection is an upsert, not a create: the device may push the same
 * collection many times as the listener opens, favourites or downloads it, and
 * each push carries the whole row. `updatedAt` makes the write last-write-wins
 * so an older push cannot undo a newer one, and `deleted` carries the device's
 * tombstone so a removal propagates instead of being resurrected by the next
 * push of a stale local copy.
 */
export const saveOnlineCollectionValidator = () =>
  object({
    set: object({
      sourceId: string(),
      externalId: string(),
      title: string(),
      languageCode: string(),
      subtitle: optional(string()),
      artworkUrl: optional(string()),
      trackCount: defaulted(number(), 0),
      pageUrl: optional(string()),
      isFavorite: optional(boolean()),
      lastOpenedAt: optional(number()),
      updatedAt: optional(number()),
      deleted: optional(boolean()),
    }),
    get: selectStruct("onlineCollection", 1),
  });
