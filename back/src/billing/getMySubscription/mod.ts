import { coreApp } from "../../../mod.ts";
import { setTokens, setUser } from "@lib";
import { getMySubscriptionFn } from "./getMySubscription.fn.ts";
import { getMySubscriptionValidator } from "./getMySubscription.val.ts";

export const getMySubscriptionSetup = () =>
  coreApp.acts.setAct({
    schema: "subscription",
    actName: "getMySubscription",
    preAct: [setTokens, setUser],
    validator: getMySubscriptionValidator(),
    fn: getMySubscriptionFn,
  });
