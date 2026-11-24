import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { createChannelPlaylistFn } from "./createChannelPlaylist.fn.ts";
import { createChannelPlaylistValidator } from "./createChannelPlaylist.val.ts";

export const createChannelPlaylistSetup = () =>
  coreApp.acts.setAct({
    schema: "channelPlaylist",
    actName: "createChannelPlaylist",
    preAct: [setTokens, setUser, requireActive],
    validator: createChannelPlaylistValidator(),
    fn: createChannelPlaylistFn,
    validationRunType: "create",
  });
