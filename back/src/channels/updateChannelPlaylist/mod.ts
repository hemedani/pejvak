import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { updateChannelPlaylistFn } from "./updateChannelPlaylist.fn.ts";
import { updateChannelPlaylistValidator } from "./updateChannelPlaylist.val.ts";

export const updateChannelPlaylistSetup = () =>
  coreApp.acts.setAct({
    schema: "channelPlaylist",
    actName: "updateChannelPlaylist",
    preAct: [setTokens, setUser, requireActive],
    validator: updateChannelPlaylistValidator(),
    fn: updateChannelPlaylistFn,
    validationRunType: "create",
  });
