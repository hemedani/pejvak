import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMySubscribedChannelsFn } from "./getMySubscribedChannels.fn.ts";
import { getMySubscribedChannelsValidator } from "./getMySubscribedChannels.val.ts";

export const getMySubscribedChannelsSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "getMySubscribedChannels",
    preAct: [setTokens, setUser],
    validator: getMySubscribedChannelsValidator(),
    fn: getMySubscribedChannelsFn,
  });
