import { coreApp } from "../../../mod.ts";
import { registerFn } from "./register.fn.ts";
import { registerValidator } from "./register.val.ts";

export const registerSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "register",
    validationRunType: "create",
    validator: registerValidator(),
    fn: registerFn,
  });
