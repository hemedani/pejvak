import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminListPlansFn } from "./adminListPlans.fn.ts";
import { adminListPlansValidator } from "./adminListPlans.val.ts";

export const adminListPlansSetup = () =>
  coreApp.acts.setAct({
    schema: "plan",
    actName: "adminListPlans",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminListPlansValidator(),
    fn: adminListPlansFn,
  });
