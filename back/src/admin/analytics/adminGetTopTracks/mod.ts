import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminGetTopTracksFn } from "./adminGetTopTracks.fn.ts";
import { adminGetTopTracksValidator } from "./adminGetTopTracks.val.ts";

export const adminGetTopTracksSetup = () =>
  coreApp.acts.setAct({
    schema: "playbackSession",
    actName: "adminGetTopTracks",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminGetTopTracksValidator(),
    fn: adminGetTopTracksFn,
  });
