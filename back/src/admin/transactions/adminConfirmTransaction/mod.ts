import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminConfirmTransactionFn } from "./adminConfirmTransaction.fn.ts";
import { adminConfirmTransactionValidator } from "./adminConfirmTransaction.val.ts";

export const adminConfirmTransactionSetup = () =>
  coreApp.acts.setAct({
    schema: "billingTransaction",
    actName: "adminConfirmTransaction",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminConfirmTransactionValidator(),
    fn: adminConfirmTransactionFn,
    validationRunType: "create",
  });
