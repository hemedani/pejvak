import { ObjectId } from "lesan";
import { user } from "../../mod.ts";

export type HistorySort = "newest" | "oldest" | "longest";

export type Setting = {
  languageCode: string | null;
  defaultSpeed: number;
  historySort: HistorySort;
  updatedAt: number;
};

export type SettingInput = {
  languageCode?: string | null;
  defaultSpeed?: number;
  historySort?: HistorySort;
  updatedAt?: number;
};

export const DEFAULT_SETTING: Setting = {
  languageCode: null,
  defaultSpeed: 1,
  historySort: "newest",
  updatedAt: 0,
};

const normalizeLanguageCode = (value: string | null): string | null => {
  if (value === null) return null;
  const trimmed = value.trim().toLowerCase();
  return trimmed === "" ? null : trimmed;
};

export const canonicalSetting = (raw: unknown): Setting => {
  const stored = raw && typeof raw === "object" ? raw as Partial<Setting> : {};

  return {
    languageCode: stored.languageCode ?? DEFAULT_SETTING.languageCode,
    defaultSpeed: stored.defaultSpeed ?? DEFAULT_SETTING.defaultSpeed,
    historySort: stored.historySort ?? DEFAULT_SETTING.historySort,
    updatedAt: stored.updatedAt ?? DEFAULT_SETTING.updatedAt,
  };
};

export const readCanonicalSetting = async (
  userId: ObjectId,
): Promise<Setting> => {
  const found = await user.findOne({
    filters: { _id: userId },
    projection: { setting: 1 },
  });

  return canonicalSetting(found?.setting);
};

export const pickSetting = (
  setting: Setting,
  get?: Record<string, number>,
): Partial<Setting> => {
  const keys = Object.keys(get ?? {});
  if (keys.length === 0) return setting;

  const picked: Record<string, unknown> = {};
  for (const key of keys) {
    if (key in setting) {
      picked[key] = setting[key as keyof Setting];
    }
  }
  return picked as Partial<Setting>;
};

const hasSettingFields = (input: SettingInput): boolean =>
  input.languageCode !== undefined ||
  input.defaultSpeed !== undefined ||
  input.historySort !== undefined;

/**
 * Atomic last-write-wins merge of the shared settings.
 *
 * `patch` keeps omitted fields (updateMySettings); `snapshot` treats omitted
 * fields as defaults (the device sends every field). The conditional update
 * only matches when the incoming timestamp is strictly newer, so two devices
 * cannot interleave a read-check-write. A write that loses happens by matching
 * no document; Lesan turns that into a thrown error, which is expected here and
 * must not surface as a failed request.
 */
export async function mergeSetting(
  userId: ObjectId,
  input: SettingInput,
  mode: "patch" | "snapshot",
): Promise<{ applied: boolean; setting: Setting }> {
  if (!hasSettingFields(input)) {
    return { applied: false, setting: await readCanonicalSetting(userId) };
  }

  const incoming = Math.min(input.updatedAt ?? Date.now(), Date.now());

  const update: Record<string, unknown> = {};

  if (mode === "snapshot") {
    update.setting = {
      ...DEFAULT_SETTING,
      ...(input.languageCode !== undefined
        ? { languageCode: normalizeLanguageCode(input.languageCode) }
        : {}),
      ...(input.defaultSpeed !== undefined
        ? { defaultSpeed: input.defaultSpeed }
        : {}),
      ...(input.historySort !== undefined
        ? { historySort: input.historySort }
        : {}),
      updatedAt: incoming,
    };
  } else {
    if (input.languageCode !== undefined) {
      update["setting.languageCode"] = normalizeLanguageCode(
        input.languageCode,
      );
    }
    if (input.defaultSpeed !== undefined) {
      update["setting.defaultSpeed"] = input.defaultSpeed;
    }
    if (input.historySort !== undefined) {
      update["setting.historySort"] = input.historySort;
    }
    update["setting.updatedAt"] = incoming;
  }

  let applied = false;
  try {
    await user.findOneAndUpdate({
      filter: {
        _id: userId,
        $or: [
          { setting: { $exists: false } },
          { "setting.updatedAt": { $exists: false } },
          { "setting.updatedAt": { $lt: incoming } },
        ],
      } as never,
      update: { $set: update } as never,
      projection: { setting: 1 },
    });
    applied = true;
  } catch {
    applied = false;
  }

  return { applied, setting: await readCanonicalSetting(userId) };
}
