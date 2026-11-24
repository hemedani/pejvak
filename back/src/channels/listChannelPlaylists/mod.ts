import { optionalAuth } from "@lib";
import { coreApp } from "../../../mod.ts";
import { listChannelPlaylistsFn } from "./listChannelPlaylists.fn.ts";
import { listChannelPlaylistsValidator } from "./listChannelPlaylists.val.ts";

/** Public read (prompt D9); `optionalAuth` elevates an operator (prompt D15). */
export const listChannelPlaylistsSetup = () =>
  coreApp.acts.setAct({
    schema: "channelPlaylist",
    actName: "listChannelPlaylists",
    preAct: [optionalAuth],
    validator: listChannelPlaylistsValidator(),
    fn: listChannelPlaylistsFn,
  });
