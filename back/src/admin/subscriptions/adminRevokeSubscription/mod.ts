import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminRevokeSubscriptionFn } from "./adminRevokeSubscription.fn.ts";
import { adminRevokeSubscriptionValidator } from "./adminRevokeSubscription.val.ts";

export const adminRevokeSubscriptionSetup = () =>
  coreApp.acts.setAct({
    schema: "subscription",
    actName: "adminRevokeSubscription",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminRevokeSubscriptionValidator(),
    fn: adminRevokeSubscriptionFn,
    validationRunType: "create",
  });
