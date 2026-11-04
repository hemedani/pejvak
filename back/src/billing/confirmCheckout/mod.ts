import { coreApp } from "../../../mod.ts";
import { requireActive, setTokens, setUser } from "@lib";
import { confirmCheckoutFn } from "./confirmCheckout.fn.ts";
import { confirmCheckoutValidator } from "./confirmCheckout.val.ts";

export const confirmCheckoutSetup = () =>
  coreApp.acts.setAct({
    schema: "subscription",
    actName: "confirmCheckout",
    preAct: [setTokens, setUser, requireActive],
    validator: confirmCheckoutValidator(),
    fn: confirmCheckoutFn,
    validationRunType: "create",
  });
