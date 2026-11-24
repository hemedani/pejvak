import { optionalAuth } from "@lib";
import { coreApp } from "../../../mod.ts";
import { listChannelAudiosFn } from "./listChannelAudios.fn.ts";
import { listChannelAudiosValidator } from "./listChannelAudios.val.ts";

/** Public read (prompt D9); `optionalAuth` elevates an operator (prompt D15). */
export const listChannelAudiosSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "listChannelAudios",
    preAct: [optionalAuth],
    validator: listChannelAudiosValidator(),
    fn: listChannelAudiosFn,
  });
