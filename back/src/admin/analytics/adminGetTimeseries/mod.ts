import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminGetTimeseriesFn } from "./adminGetTimeseries.fn.ts";
import { adminGetTimeseriesValidator } from "./adminGetTimeseries.val.ts";

export const adminGetTimeseriesSetup = () =>
  coreApp.acts.setAct({
    schema: "playbackSession",
    actName: "adminGetTimeseries",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminGetTimeseriesValidator(),
    fn: adminGetTimeseriesFn,
  });
