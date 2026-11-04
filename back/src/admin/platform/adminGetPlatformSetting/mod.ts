import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminGetPlatformSettingFn } from "./adminGetPlatformSetting.fn.ts";
import { adminGetPlatformSettingValidator } from "./adminGetPlatformSetting.val.ts";

export const adminGetPlatformSettingSetup = () =>
  coreApp.acts.setAct({
    schema: "platformSetting",
    actName: "adminGetPlatformSetting",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminGetPlatformSettingValidator(),
    fn: adminGetPlatformSettingFn,
  });
