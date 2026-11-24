import { optionalAuth } from "@lib";
import { coreApp } from "../../../mod.ts";
import { listChannelsFn } from "./listChannels.fn.ts";
import { listChannelsValidator } from "./listChannels.val.ts";

/**
 * Public on purpose (prompt D9): `optionalAuth` means no token is required, yet
 * an operator who presents one may list `removed` channels too (prompt D15) — the
 * panel and the directory are the same act.
 */
export const listChannelsSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "listChannels",
    preAct: [optionalAuth],
    validator: listChannelsValidator(),
    fn: listChannelsFn,
  });
