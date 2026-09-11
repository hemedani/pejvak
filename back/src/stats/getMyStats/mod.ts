import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyStatsFn } from "./getMyStats.fn.ts";
import { getMyStatsValidator } from "./getMyStats.val.ts";

export const getMyStatsSetup = () =>
  coreApp.acts.setAct({
    schema: "playbackSession",
    fn: getMyStatsFn,
    actName: "getMyStats",
    preAct: [setTokens, setUser],
    validator: getMyStatsValidator(),
  });
