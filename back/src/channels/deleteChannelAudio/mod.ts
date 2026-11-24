import { requireActive, setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { deleteChannelAudioFn } from "./deleteChannelAudio.fn.ts";
import { deleteChannelAudioValidator } from "./deleteChannelAudio.val.ts";

export const deleteChannelAudioSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "deleteChannelAudio",
    preAct: [setTokens, setUser, requireActive],
    validator: deleteChannelAudioValidator(),
    fn: deleteChannelAudioFn,
  });
