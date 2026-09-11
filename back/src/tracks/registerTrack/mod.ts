import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { registerTrackFn } from "./registerTrack.fn.ts";
import { registerTrackValidator } from "./registerTrack.val.ts";

export const registerTrackSetup = () =>
  coreApp.acts.setAct({
    schema: "track",
    fn: registerTrackFn,
    actName: "registerTrack",
    preAct: [setTokens, setUser],
    validator: registerTrackValidator(),
    validationRunType: "create",
  });
