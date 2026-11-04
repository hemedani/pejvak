import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminGrantAiCreditsFn } from "./adminGrantAiCredits.fn.ts";
import { adminGrantAiCreditsValidator } from "./adminGrantAiCredits.val.ts";

export const adminGrantAiCreditsSetup = () =>
  coreApp.acts.setAct({
    schema: "aiUsage",
    actName: "adminGrantAiCredits",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminGrantAiCreditsValidator(),
    fn: adminGrantAiCreditsFn,
    validationRunType: "create",
  });
