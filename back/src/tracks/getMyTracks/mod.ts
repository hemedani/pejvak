import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyTracksFn } from "./getMyTracks.fn.ts";
import { getMyTracksValidator } from "./getMyTracks.val.ts";

export const getMyTracksSetup = () =>
  coreApp.acts.setAct({
    schema: "track",
    fn: getMyTracksFn,
    actName: "getMyTracks",
    preAct: [setTokens, setUser],
    validator: getMyTracksValidator(),
  });
