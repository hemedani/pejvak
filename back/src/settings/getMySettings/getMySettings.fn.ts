import { type ActFn, ObjectId } from "lesan";
import { coreApp } from "../../../mod.ts";
import { type MyContext } from "@lib";
import { pickSetting, readCanonicalSetting } from "../mergeSetting.ts";

export const getMySettingsFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const { get } = body.details;

  // Never writes: an absent `setting` object simply reads back as defaults.
  const setting = await readCanonicalSetting(new ObjectId(user._id));

  return pickSetting(setting, get);
};
