import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { listChannelSubscribersFn } from "./listChannelSubscribers.fn.ts";
import { listChannelSubscribersValidator } from "./listChannelSubscribers.val.ts";

export const listChannelSubscribersSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "listChannelSubscribers",
    preAct: [setTokens, setUser],
    validator: listChannelSubscribersValidator(),
    fn: listChannelSubscribersFn,
  });
