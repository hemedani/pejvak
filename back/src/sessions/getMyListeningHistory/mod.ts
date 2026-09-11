import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyListeningHistoryFn } from "./getMyListeningHistory.fn.ts";
import { getMyListeningHistoryValidator } from "./getMyListeningHistory.val.ts";

export const getMyListeningHistorySetup = () =>
  coreApp.acts.setAct({
    schema: "playbackSession",
    fn: getMyListeningHistoryFn,
    actName: "getMyListeningHistory",
    preAct: [setTokens, setUser],
    validator: getMyListeningHistoryValidator(),
  });
