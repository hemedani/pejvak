import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminDeleteUserFn } from "./adminDeleteUser.fn.ts";
import { adminDeleteUserValidator } from "./adminDeleteUser.val.ts";

export const adminDeleteUserSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "adminDeleteUser",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminDeleteUserValidator(),
    fn: adminDeleteUserFn,
    validationRunType: "create",
  });
