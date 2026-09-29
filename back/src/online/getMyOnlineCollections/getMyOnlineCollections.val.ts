import { boolean, enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

/**
 * The listener's shelf of online collections.
 *
 * `isFavorite` answers the Favorites tab and `sourceId` narrows to one source's
 * saved shows; both are filters over the same list rather than separate acts,
 * because "my favourites from manahej, newest first" is one question.
 */
export const getMyOnlineCollectionsValidator = () =>
  object({
    set: object({
      ...pagination,
      isFavorite: optional(boolean()),
      sourceId: optional(string()),
      languageCode: optional(string()),
      sortBy: optional(enums(["updatedAt", "lastOpenedAt", "title"])),
      sortOrder: optional(enums(["asc", "desc"])),
    }),
    get: selectStruct("onlineCollection", 2),
  });
