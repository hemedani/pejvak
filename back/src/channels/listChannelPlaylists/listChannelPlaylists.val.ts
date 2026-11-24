import { object, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

/** Folders of one channel, in their manual order. */
export const listChannelPlaylistsValidator = () =>
  object({
    set: object({
      channelId: string(),
      ...pagination,
    }),
    get: selectStruct("channelPlaylist", 1),
  });
