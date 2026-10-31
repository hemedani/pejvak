import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { updateMySettingsFn } from "./updateMySettings.fn.ts";
import { updateMySettingsValidator } from "./updateMySettings.val.ts";

export const updateMySettingsSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    fn: updateMySettingsFn,
    actName: "updateMySettings",
    preAct: [setTokens, setUser],
    validator: updateMySettingsValidator(),
  });
