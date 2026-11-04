import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminGetRetentionFn } from "./adminGetRetention.fn.ts";
import { adminGetRetentionValidator } from "./adminGetRetention.val.ts";

export const adminGetRetentionSetup = () =>
  coreApp.acts.setAct({
    schema: "playbackSession",
    actName: "adminGetRetention",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminGetRetentionValidator(),
    fn: adminGetRetentionFn,
  });
