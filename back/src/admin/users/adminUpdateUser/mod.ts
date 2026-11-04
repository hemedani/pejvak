import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminUpdateUserFn } from "./adminUpdateUser.fn.ts";
import { adminUpdateUserValidator } from "./adminUpdateUser.val.ts";

export const adminUpdateUserSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "adminUpdateUser",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminUpdateUserValidator(),
    fn: adminUpdateUserFn,
    validationRunType: "create",
  });
