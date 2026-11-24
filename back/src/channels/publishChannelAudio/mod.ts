import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { publishChannelAudioFn } from "./publishChannelAudio.fn.ts";
import { publishChannelAudioValidator } from "./publishChannelAudio.val.ts";

export const publishChannelAudioSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "publishChannelAudio",
    preAct: [setTokens, setUser, requireActive],
    validator: publishChannelAudioValidator(),
    fn: publishChannelAudioFn,
    validationRunType: "create",
  });
