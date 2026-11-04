import type { ActFn } from "lesan";
import { pickByGet } from "@lib";
import { platformSetting } from "../../../../mod.ts";
import { recordAudit } from "../../audit.ts";
import {
  PLATFORM_SETTING_KEY,
  readPlatformSetting,
} from "../../../platform/setting.ts";

/**
 * Flips the global switches.
 *
 * Only the four fields that are not per-user live here. Limits and prices are
 * not among them on purpose: they belong to a plan, because they are sold, and
 * a second place to set them would be a second answer to the same question.
 *
 * Closing signups is audited like any other mutation — during an incident it is
 * the first thing someone will want to explain afterwards.
 */
export const adminUpdatePlatformSettingFn: ActFn = async (body) => {
  const { set } = body.details;

  // Ensures the row exists before updating it, so the first edit on a fresh
  // database is an update rather than a silent no-op.
  const before = await readPlatformSetting();

  const fields: Record<string, unknown> = { updatedAt: new Date() };
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (
    const key of [
      "signupsEnabled",
      "aiEnabled",
      "maintenanceMode",
      "announcement",
    ] as const
  ) {
    if (set[key] !== undefined) {
      fields[key] = set[key];
      changes[key] = {
        from: (before as Record<string, unknown>)[key] ?? null,
        to: set[key],
      };
    }
  }

  if (Object.keys(changes).length > 0) {
    await platformSetting.findOneAndUpdate({
      filter: { key: PLATFORM_SETTING_KEY },
      update: { $set: fields },
      projection: { _id: 1 },
    });

    await recordAudit({
      action: "platform.update",
      targetType: "platformSetting",
      targetId: PLATFORM_SETTING_KEY,
      summary: `Changed ${Object.keys(changes).join(", ")}`,
      metadata: { changes },
    });
  }

  const after = await readPlatformSetting();
  return pickByGet(
    { ...after, key: PLATFORM_SETTING_KEY },
    body.details.get,
  );
};
