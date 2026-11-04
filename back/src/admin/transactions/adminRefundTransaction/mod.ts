import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminRefundTransactionFn } from "./adminRefundTransaction.fn.ts";
import { adminRefundTransactionValidator } from "./adminRefundTransaction.val.ts";

export const adminRefundTransactionSetup = () =>
  coreApp.acts.setAct({
    schema: "billingTransaction",
    actName: "adminRefundTransaction",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminRefundTransactionValidator(),
    fn: adminRefundTransactionFn,
    validationRunType: "create",
  });
