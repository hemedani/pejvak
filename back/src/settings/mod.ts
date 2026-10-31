import { getMySettingsSetup } from "./getMySettings/mod.ts";
import { updateMySettingsSetup } from "./updateMySettings/mod.ts";

export const settingsSetup = () => {
  getMySettingsSetup();
  updateMySettingsSetup();
};
