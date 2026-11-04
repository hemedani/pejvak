import { coreApp } from "../../../mod.ts";
import { requireActive, setTokens, setUser } from "@lib";
import { cancelMySubscriptionFn } from "./cancelMySubscription.fn.ts";
import { cancelMySubscriptionValidator } from "./cancelMySubscription.val.ts";

export const cancelMySubscriptionSetup = () =>
  coreApp.acts.setAct({
    schema: "subscription",
    actName: "cancelMySubscription",
    preAct: [setTokens, setUser, requireActive],
    validator: cancelMySubscriptionValidator(),
    fn: cancelMySubscriptionFn,
  });
