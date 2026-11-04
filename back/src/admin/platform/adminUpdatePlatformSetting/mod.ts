import { coreApp } from "../../../../mod.ts";
import { requireAdmin, setTokens, setUser } from "@lib";
import { adminUpdatePlatformSettingFn } from "./adminUpdatePlatformSetting.fn.ts";
import { adminUpdatePlatformSettingValidator } from "./adminUpdatePlatformSetting.val.ts";

export const adminUpdatePlatformSettingSetup = () =>
  coreApp.acts.setAct({
    schema: "platformSetting",
    actName: "adminUpdatePlatformSetting",
    preAct: [setTokens, setUser, requireAdmin],
    validator: adminUpdatePlatformSettingValidator(),
    fn: adminUpdatePlatformSettingFn,
    validationRunType: "create",
  });
