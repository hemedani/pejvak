import { optionalAuth } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getChannelAudioFn } from "./getChannelAudio.fn.ts";
import { getChannelAudioValidator } from "./getChannelAudio.val.ts";

/**
 * Public read (prompt D9): the player opens an episode without a token.
 * `optionalAuth` lets an operator resolve a removed episode too (prompt D15).
 */
export const getChannelAudioSetup = () =>
  coreApp.acts.setAct({
    schema: "channelAudio",
    actName: "getChannelAudio",
    preAct: [optionalAuth],
    validator: getChannelAudioValidator(),
    fn: getChannelAudioFn,
  });
