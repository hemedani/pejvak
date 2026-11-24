import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyChannelsFn } from "./getMyChannels.fn.ts";
import { getMyChannelsValidator } from "./getMyChannels.val.ts";

export const getMyChannelsSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "getMyChannels",
    preAct: [setTokens, setUser],
    validator: getMyChannelsValidator(),
    fn: getMyChannelsFn,
  });
