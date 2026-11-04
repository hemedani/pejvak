import { coreApp } from "../../../mod.ts";
import { setTokens, setUser } from "@lib";
import { getMyAiUsageFn } from "./getMyAiUsage.fn.ts";
import { getMyAiUsageValidator } from "./getMyAiUsage.val.ts";

export const getMyAiUsageSetup = () =>
  coreApp.acts.setAct({
    schema: "aiUsage",
    actName: "getMyAiUsage",
    preAct: [setTokens, setUser],
    validator: getMyAiUsageValidator(),
    fn: getMyAiUsageFn,
  });
