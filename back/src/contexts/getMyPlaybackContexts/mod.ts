import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyPlaybackContextsFn } from "./getMyPlaybackContexts.fn.ts";
import { getMyPlaybackContextsValidator } from "./getMyPlaybackContexts.val.ts";

export const getMyPlaybackContextsSetup = () =>
  coreApp.acts.setAct({
    schema: "playbackContext",
    fn: getMyPlaybackContextsFn,
    actName: "getMyPlaybackContexts",
    preAct: [setTokens, setUser],
    validator: getMyPlaybackContextsValidator(),
  });
