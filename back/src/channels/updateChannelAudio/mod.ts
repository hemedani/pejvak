import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { updateChannelAudioFn } from "./updateChannelAudio.fn.ts";
import { updateChannelAudioValidator } from "./updateChannelAudio.val.ts";

export const updateChannelAudioSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "updateChannelAudio",
    preAct: [setTokens, setUser, requireActive],
    validator: updateChannelAudioValidator(),
    fn: updateChannelAudioFn,
    validationRunType: "create",
  });
