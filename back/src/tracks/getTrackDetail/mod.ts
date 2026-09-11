import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getTrackDetailFn } from "./getTrackDetail.fn.ts";
import { getTrackDetailValidator } from "./getTrackDetail.val.ts";

export const getTrackDetailSetup = () =>
  coreApp.acts.setAct({
    schema: "track",
    fn: getTrackDetailFn,
    actName: "getTrackDetail",
    preAct: [setTokens, setUser],
    validator: getTrackDetailValidator(),
  });
