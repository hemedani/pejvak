import { object } from "lesan";
import { settingProjection } from "../projection.ts";

export const getMySettingsValidator = () =>
  object({
    set: object({}),
    get: settingProjection(),
  });
