/**
 * The four global switches.
 *
 * The defaults are the same ones `readPlatformSetting` uses on the backend:
 * signups on, AI off, maintenance off. A fresh database must show the same
 * answer here as it would in the register act.
 */

import { asBoolean, asRecord, asString, asTimestamp } from "@/lib/parse";

export type PlatformSetting = {
  key: string;
  signupsEnabled: boolean;
  aiEnabled: boolean;
  maintenanceMode: boolean;
  announcement: string | null;
  updatedAt: number | null;
};

export const PLATFORM_GET = {
  key: 1,
  signupsEnabled: 1,
  aiEnabled: 1,
  maintenanceMode: 1,
  announcement: 1,
} as const;

export function parsePlatformSetting(raw: unknown): PlatformSetting | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const announcement = asString(record.announcement);

  return {
    key: asString(record.key) ?? "platform",
    signupsEnabled: record.signupsEnabled !== false,
    aiEnabled: asBoolean(record.aiEnabled),
    maintenanceMode: asBoolean(record.maintenanceMode),
    announcement: announcement && announcement.trim() !== "" ? announcement : null,
    updatedAt: asTimestamp(record.updatedAt),
  };
}
