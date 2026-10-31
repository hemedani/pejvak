import { type ActFn, ObjectId } from "lesan";
import { coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import {
  mergeSetting,
  pickSetting,
  type SettingInput,
} from "../mergeSetting.ts";

export const updateMySettingsFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const { set, get } = body.details;

  const input = set as SettingInput;

  if (
    input.languageCode !== null &&
    input.languageCode !== undefined &&
    input.languageCode.trim().length > 16
  ) {
    throwError("languageCode must be at most 16 characters");
  }

  const { setting } = await mergeSetting(
    new ObjectId(user._id),
    input,
    "patch",
  );

  return pickSetting(setting, get);
};
