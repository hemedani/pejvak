import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { subscribeChannelFn } from "./subscribeChannel.fn.ts";
import { subscribeChannelValidator } from "./subscribeChannel.val.ts";

export const subscribeChannelSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "subscribeChannel",
    preAct: [setTokens, setUser, requireActive],
    validator: subscribeChannelValidator(),
    fn: subscribeChannelFn,
    validationRunType: "create",
  });
