import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { deleteChannelPlaylistFn } from "./deleteChannelPlaylist.fn.ts";
import { deleteChannelPlaylistValidator } from "./deleteChannelPlaylist.val.ts";

export const deleteChannelPlaylistSetup = () =>
  coreApp.acts.setAct({
    schema: "channelPlaylist",
    actName: "deleteChannelPlaylist",
    preAct: [setTokens, setUser, requireActive],
    validator: deleteChannelPlaylistValidator(),
    fn: deleteChannelPlaylistFn,
  });
