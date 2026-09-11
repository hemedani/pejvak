import {
  array,
  boolean,
  number,
  object,
  objectIdValidation,
  optional,
  string,
} from "lesan";
import { selectStruct } from "../../../mod.ts";

export const updatePlaylistValidator = () =>
  object({
    set: object({
      playlistId: string(),
      title: optional(string()),
      description: optional(string()),
      isPublic: optional(boolean()),
      items: optional(
        array(object({ trackId: objectIdValidation, order: number() })),
      ),
    }),
    get: selectStruct("playlist", 1),
  });
