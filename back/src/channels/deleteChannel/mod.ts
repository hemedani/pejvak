import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { deleteChannelFn } from "./deleteChannel.fn.ts";
import { deleteChannelValidator } from "./deleteChannel.val.ts";

export const deleteChannelSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "deleteChannel",
    preAct: [setTokens, setUser, requireActive],
    validator: deleteChannelValidator(),
    fn: deleteChannelFn,
  });
