import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminUpsertPlanFn } from "./adminUpsertPlan.fn.ts";
import { adminUpsertPlanValidator } from "./adminUpsertPlan.val.ts";

export const adminUpsertPlanSetup = () =>
  coreApp.acts.setAct({
    schema: "plan",
    actName: "adminUpsertPlan",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminUpsertPlanValidator(),
    fn: adminUpsertPlanFn,
    validationRunType: "create",
  });
