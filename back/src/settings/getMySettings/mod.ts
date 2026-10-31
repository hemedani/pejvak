import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMySettingsFn } from "./getMySettings.fn.ts";
import { getMySettingsValidator } from "./getMySettings.val.ts";

export const getMySettingsSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    fn: getMySettingsFn,
    actName: "getMySettings",
    preAct: [setTokens, setUser],
    validator: getMySettingsValidator(),
  });
