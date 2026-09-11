import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { syncLocalDataFn } from "./syncLocalData.fn.ts";
import { syncLocalDataValidator } from "./syncLocalData.val.ts";

export const syncLocalDataSetup = () =>
  coreApp.acts.setAct({
    schema: "track",
    fn: syncLocalDataFn,
    actName: "syncLocalData",
    preAct: [setTokens, setUser],
    validator: syncLocalDataValidator(),
  });
