import type { ActFn } from "lesan";
import { pickByGet } from "@lib";
import { readPlatformSetting } from "../../../platform/setting.ts";

/**
 * The global switches, read on the panel's settings page.
 *
 * Reads through the same `readPlatformSetting` the register act uses, so the
 * panel and the backend can never disagree about the defaults: a fresh database
 * shows "signups enabled" because that is what a registration would assume.
 */
export const adminGetPlatformSettingFn: ActFn = async (body) => {
  const setting = await readPlatformSetting();
  return pickByGet({
    ...setting,
    key: "platform",
    announcement: setting.announcement?.trim() ? setting.announcement : null,
  }, body.details.get);
};
