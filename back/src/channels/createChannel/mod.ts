import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { createChannelFn } from "./createChannel.fn.ts";
import { createChannelValidator } from "./createChannel.val.ts";

export const createChannelSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "createChannel",
    preAct: [setTokens, setUser, requireActive],
    validator: createChannelValidator(),
    fn: createChannelFn,
    validationRunType: "create",
  });
