import { object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

/**
 * `contextType` / `contextKey` narrow the list to one collection's runs, which
 * is how a playlist or folder screen reads its own history without pulling
 * every run the user has ever made.
 */
export const getMyPlaybackContextsValidator = () =>
  object({
    set: object({
      ...pagination,
      contextType: optional(string()),
      contextKey: optional(string()),
    }),
    get: selectStruct("playbackContext", 2),
  });
