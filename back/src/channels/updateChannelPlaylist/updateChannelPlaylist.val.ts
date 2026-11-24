import { array, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/** Patches a folder. The channel and owner are fixed; only metadata moves. */
export const updateChannelPlaylistValidator = () =>
  object({
    set: object({
      playlistId: string(),
      title: optional(string()),
      description: optional(string()),
      category: optional(string()),
      tags: optional(array(string())),
      sortOrder: optional(number()),
    }),
    get: selectStruct("channelPlaylist", 1),
  });
