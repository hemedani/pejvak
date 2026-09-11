import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { createPlaylistFn } from "./createPlaylist.fn.ts";
import { createPlaylistValidator } from "./createPlaylist.val.ts";

export const createPlaylistSetup = () =>
  coreApp.acts.setAct({
    schema: "playlist",
    fn: createPlaylistFn,
    actName: "createPlaylist",
    preAct: [setTokens, setUser],
    validator: createPlaylistValidator(),
    validationRunType: "create",
  });
