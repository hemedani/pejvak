import { boolean, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

export const createPlaylistValidator = () =>
  object({
    set: object({
      title: string(),
      description: optional(string()),
      isPublic: optional(boolean()),
    }),
    get: selectStruct("playlist", 1),
  });
