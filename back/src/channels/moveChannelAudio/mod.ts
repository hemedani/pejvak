import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { moveChannelAudioFn } from "./moveChannelAudio.fn.ts";
import { moveChannelAudioValidator } from "./moveChannelAudio.val.ts";

export const moveChannelAudioSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "moveChannelAudio",
    preAct: [setTokens, setUser, requireActive],
    validator: moveChannelAudioValidator(),
    fn: moveChannelAudioFn,
    validationRunType: "create",
  });
