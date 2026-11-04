import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminResetUserPasswordFn } from "./adminResetUserPassword.fn.ts";
import { adminResetUserPasswordValidator } from "./adminResetUserPassword.val.ts";

export const adminResetUserPasswordSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "adminResetUserPassword",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminResetUserPasswordValidator(),
    fn: adminResetUserPasswordFn,
    validationRunType: "create",
  });
