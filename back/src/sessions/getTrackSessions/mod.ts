import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getTrackSessionsFn } from "./getTrackSessions.fn.ts";
import { getTrackSessionsValidator } from "./getTrackSessions.val.ts";

export const getTrackSessionsSetup = () =>
  coreApp.acts.setAct({
    schema: "playbackSession",
    fn: getTrackSessionsFn,
    actName: "getTrackSessions",
    preAct: [setTokens, setUser],
    validator: getTrackSessionsValidator(),
  });
