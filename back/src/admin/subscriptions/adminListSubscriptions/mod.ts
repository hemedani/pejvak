import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminListSubscriptionsFn } from "./adminListSubscriptions.fn.ts";
import { adminListSubscriptionsValidator } from "./adminListSubscriptions.val.ts";

export const adminListSubscriptionsSetup = () =>
  coreApp.acts.setAct({
    schema: "subscription",
    actName: "adminListSubscriptions",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminListSubscriptionsValidator(),
    fn: adminListSubscriptionsFn,
  });
