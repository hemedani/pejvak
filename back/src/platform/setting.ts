import { platformSetting } from "../../mod.ts";

export const PLATFORM_SETTING_KEY = "platform";

export type PlatformSetting = {
  signupsEnabled: boolean;
  aiEnabled: boolean;
  maintenanceMode: boolean;
  announcement?: string;
};

export const DEFAULT_PLATFORM_SETTING: PlatformSetting = {
  signupsEnabled: true,
  aiEnabled: false,
  maintenanceMode: false,
};

/**
 * Reads the singleton, creating it on first read.
 *
 * Reading is allowed to write because the alternative is worse: a register or
 * login act would have to branch on "no settings row yet" and duplicate the
 * defaults. The insert is guarded by a unique index on `key`, so two requests
 * racing on a fresh database cannot create two rows.
 */
export const readPlatformSetting = async (): Promise<PlatformSetting> => {
  const found = await platformSetting.findOne({
    filters: { key: PLATFORM_SETTING_KEY },
    projection: {
      signupsEnabled: 1,
      aiEnabled: 1,
      maintenanceMode: 1,
      announcement: 1,
    },
  });

  if (found) {
    return {
      signupsEnabled: found.signupsEnabled ?? true,
      aiEnabled: found.aiEnabled ?? false,
      maintenanceMode: found.maintenanceMode ?? false,
      ...(found.announcement !== undefined
        ? { announcement: found.announcement }
        : {}),
    };
  }

  try {
    await platformSetting.insertOne({
      doc: {
        key: PLATFORM_SETTING_KEY,
        ...DEFAULT_PLATFORM_SETTING,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      projection: { _id: 1 },
    });
  } catch {
    // A concurrent request won the insert; its row is as good as ours.
  }

  return { ...DEFAULT_PLATFORM_SETTING };
};

export const ensurePlatformSetting = async () => {
  await readPlatformSetting();
};
