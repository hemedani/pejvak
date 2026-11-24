import { array, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * Adding a folder to a caller-owned channel.
 *
 * `channelId` names the channel, but the act — not the client — decides the
 * channel that ends up embedded on the folder and its audios: it verifies the
 * caller owns that channel first (prompt D8). `category` is exactly one and
 * required (prompt D5); `sortOrder`, when omitted, appends after the folders the
 * channel already has.
 */
export const createChannelPlaylistValidator = () =>
  object({
    set: object({
      channelId: string(),
      title: string(),
      category: string(),
      description: optional(string()),
      tags: optional(array(string())),
      sortOrder: optional(number()),
    }),
    get: selectStruct("channelPlaylist", 1),
  });
