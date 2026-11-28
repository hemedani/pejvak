import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { unsubscribeChannelFn } from "./unsubscribeChannel.fn.ts";
import { unsubscribeChannelValidator } from "./unsubscribeChannel.val.ts";

export const unsubscribeChannelSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "unsubscribeChannel",
    preAct: [setTokens, setUser, requireActive],
    validator: unsubscribeChannelValidator(),
    fn: unsubscribeChannelFn,
  });
