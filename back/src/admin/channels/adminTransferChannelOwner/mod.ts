import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminTransferChannelOwnerFn } from "./adminTransferChannelOwner.fn.ts";
import { adminTransferChannelOwnerValidator } from "./adminTransferChannelOwner.val.ts";

export const adminTransferChannelOwnerSetup = () =>
  coreApp.acts.setAct({
    schema: "channel",
    actName: "adminTransferChannelOwner",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminTransferChannelOwnerValidator(),
    fn: adminTransferChannelOwnerFn,
    validationRunType: "create",
  });
