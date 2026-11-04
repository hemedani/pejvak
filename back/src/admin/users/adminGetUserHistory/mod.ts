import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminGetUserHistoryFn } from "./adminGetUserHistory.fn.ts";
import { adminGetUserHistoryValidator } from "./adminGetUserHistory.val.ts";

export const adminGetUserHistorySetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "adminGetUserHistory",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminGetUserHistoryValidator(),
    fn: adminGetUserHistoryFn,
  });
