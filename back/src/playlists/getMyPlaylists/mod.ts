import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyPlaylistsFn } from "./getMyPlaylists.fn.ts";
import { getMyPlaylistsValidator } from "./getMyPlaylists.val.ts";

export const getMyPlaylistsSetup = () =>
  coreApp.acts.setAct({
    schema: "playlist",
    fn: getMyPlaylistsFn,
    actName: "getMyPlaylists",
    preAct: [setTokens, setUser],
    validator: getMyPlaylistsValidator(),
  });
