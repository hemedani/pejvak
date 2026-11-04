import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminGrantSubscriptionFn } from "./adminGrantSubscription.fn.ts";
import { adminGrantSubscriptionValidator } from "./adminGrantSubscription.val.ts";

export const adminGrantSubscriptionSetup = () =>
  coreApp.acts.setAct({
    schema: "subscription",
    actName: "adminGrantSubscription",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminGrantSubscriptionValidator(),
    fn: adminGrantSubscriptionFn,
    validationRunType: "create",
  });
