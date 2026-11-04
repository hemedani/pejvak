import { coreApp } from "../../../mod.ts";
import { getPlatformStatusFn } from "./getPlatformStatus.fn.ts";
import { getPlatformStatusValidator } from "./getPlatformStatus.val.ts";

/**
 * Public on purpose: no `preAct` means no token is required. A client needs the
 * maintenance banner and the AI switch before it has an account.
 */
export const getPlatformStatusSetup = () =>
  coreApp.acts.setAct({
    schema: "platformSetting",
    actName: "getPlatformStatus",
    validator: getPlatformStatusValidator(),
    fn: getPlatformStatusFn,
  });
