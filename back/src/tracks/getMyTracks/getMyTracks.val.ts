import { boolean, enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

export const getMyTracksValidator = () =>
  object({
    set: object({
      ...pagination,
      isAudiobook: optional(boolean()),
      search: optional(string()),
      sortBy: optional(
        enums(["createdAt", "updatedAt", "title", "lastPlayedAt"]),
      ),
      sortOrder: optional(enums(["asc", "desc"])),
    }),
    get: selectStruct("track", 2),
  });
