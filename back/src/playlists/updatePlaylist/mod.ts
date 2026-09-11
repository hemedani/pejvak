import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { updatePlaylistFn } from "./updatePlaylist.fn.ts";
import { updatePlaylistValidator } from "./updatePlaylist.val.ts";

export const updatePlaylistSetup = () =>
  coreApp.acts.setAct({
    schema: "playlist",
    fn: updatePlaylistFn,
    actName: "updatePlaylist",
    preAct: [setTokens, setUser],
    validator: updatePlaylistValidator(),
  });
