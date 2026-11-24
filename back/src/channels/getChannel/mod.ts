import { optionalAuth } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getChannelFn } from "./getChannel.fn.ts";
import { getChannelValidator } from "./getChannel.val.ts";

/**
 * Anonymous by default (prompt D9), but `optionalAuth` lets an operator who
 * presents a token see a `removed` channel through the same act (prompt D15) —
 * no separate `adminGetChannel`.
 */
export const getChannelSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "getChannel",
    preAct: [optionalAuth],
    validator: getChannelValidator(),
    fn: getChannelFn,
  });
