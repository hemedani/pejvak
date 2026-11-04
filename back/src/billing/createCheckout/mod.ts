import { coreApp } from "../../../mod.ts";
import { requireActive, setTokens, setUser } from "@lib";
import { createCheckoutFn } from "./createCheckout.fn.ts";
import { createCheckoutValidator } from "./createCheckout.val.ts";

export const createCheckoutSetup = () =>
  coreApp.acts.setAct({
    schema: "subscription",
    actName: "createCheckout",
    preAct: [setTokens, setUser, requireActive],
    validator: createCheckoutValidator(),
    fn: createCheckoutFn,
    validationRunType: "create",
  });
