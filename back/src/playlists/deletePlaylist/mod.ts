import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { deletePlaylistFn } from "./deletePlaylist.fn.ts";
import { deletePlaylistValidator } from "./deletePlaylist.val.ts";

export const deletePlaylistSetup = () =>
  coreApp.acts.setAct({
    schema: "playlist",
    fn: deletePlaylistFn,
    actName: "deletePlaylist",
    preAct: [setTokens, setUser],
    validator: deletePlaylistValidator(),
  });
