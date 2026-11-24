import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { updateChannelFn } from "./updateChannel.fn.ts";
import { updateChannelValidator } from "./updateChannel.val.ts";

export const updateChannelSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "updateChannel",
    preAct: [setTokens, setUser, requireActive],
    validator: updateChannelValidator(),
    fn: updateChannelFn,
    validationRunType: "create",
  });
