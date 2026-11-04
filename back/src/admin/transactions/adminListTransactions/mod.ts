import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminListTransactionsFn } from "./adminListTransactions.fn.ts";
import { adminListTransactionsValidator } from "./adminListTransactions.val.ts";

export const adminListTransactionsSetup = () =>
  coreApp.acts.setAct({
    schema: "billingTransaction",
    actName: "adminListTransactions",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminListTransactionsValidator(),
    fn: adminListTransactionsFn,
  });
