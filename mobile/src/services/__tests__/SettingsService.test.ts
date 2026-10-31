import { DEFAULT_SHARED_SETTINGS } from "@/lib/settings";
import { SettingsService, subscribeToSettings } from "@/services/SettingsService";
import { LocalDBService } from "@/services/LocalDBService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getTracksByIds: jest.fn(async () => []),
    getSetting: jest.fn(),
    setSetting: jest.fn(),
  },
}));

const getSetting = jest.mocked(LocalDBService.getSetting);
const setSetting = jest.mocked(LocalDBService.setSetting);

beforeEach(() => jest.clearAllMocks());
afterEach(() => jest.restoreAllMocks());

describe("SettingsService.load", () => {
  it("returns defaults when nothing is stored", async () => {
    getSetting.mockResolvedValue(null);
    expect(await SettingsService.load()).toEqual({
      themePreference: "system",
      defaultSpeed: 1,
      historySort: "newest",
      motionPreference: "system",
      hapticsEnabled: true,
      languageCode: null,
    });
  });

  it("returns stored values", async () => {
    getSetting.mockImplementation(async (key) => {
      switch (key) {
        case "themePreference":
          return "dark";
        case "defaultSpeed":
          return "1.5";
        case "motionPreference":
          return "reduced";
        case "hapticsEnabled":
          return "false";
        case "languageCode":
          return "fa";
        default:
          // "1.5" is not a valid sort, so it falls back rather than propagating.
          return null;
      }
    });
    expect(await SettingsService.load()).toEqual({
      themePreference: "dark",
      defaultSpeed: 1.5,
      historySort: "newest",
      motionPreference: "reduced",
      hapticsEnabled: false,
      languageCode: "fa",
    });
  });

  it("restores a stored history sort", async () => {
    getSetting.mockImplementation(async (key) => (key === "historySort" ? "longest" : null));
    expect((await SettingsService.load()).historySort).toBe("longest");
  });

  it("restores a stored language", async () => {
    getSetting.mockImplementation(async (key) => (key === "languageCode" ? "fa" : null));
    expect((await SettingsService.load()).languageCode).toBe("fa");
  });
});

describe("SettingsService setters", () => {
  it("persists the theme and speed", async () => {
    await SettingsService.setTheme("light");
    await SettingsService.setDefaultSpeed(2);

    expect(setSetting).toHaveBeenCalledWith("themePreference", "light");
    expect(setSetting).toHaveBeenCalledWith("defaultSpeed", "2");
  });

  it("persists the history sort", async () => {
    await SettingsService.setHistorySort("oldest");
    expect(setSetting).toHaveBeenCalledWith("historySort", "oldest");
  });

  it("persists motion and haptics preferences", async () => {
    await SettingsService.setMotionPreference("full");
    await SettingsService.setHapticsEnabled(false);

    expect(setSetting).toHaveBeenCalledWith("motionPreference", "full");
    expect(setSetting).toHaveBeenCalledWith("hapticsEnabled", "false");
  });

  it("persists and clears the chosen language", async () => {
    await SettingsService.setLanguage("fa");
    await SettingsService.setLanguage(null);

    expect(setSetting).toHaveBeenCalledWith("languageCode", "fa");
    expect(setSetting).toHaveBeenCalledWith("languageCode", "");
  });
});

describe("SettingsService shared settings", () => {
  it("returns the shared defaults before anything has changed", async () => {
    getSetting.mockResolvedValue(null);
    expect(await SettingsService.getSharedSettings()).toEqual(DEFAULT_SHARED_SETTINGS);
  });

  it("returns the stored shared values with their change time", async () => {
    getSetting.mockImplementation(async (key) => {
      switch (key) {
        case "languageCode":
          return "fa";
        case "defaultSpeed":
          return "2";
        case "historySort":
          return "oldest";
        case "settingsUpdatedAt":
          return "1700000000000";
        default:
          return null;
      }
    });

    expect(await SettingsService.getSharedSettings()).toEqual({
      languageCode: "fa",
      defaultSpeed: 2,
      historySort: "oldest",
      updatedAt: 1700000000000,
    });
  });

  it("stamps every shared change with a newer timestamp", async () => {
    jest.spyOn(Date, "now").mockReturnValue(5000);
    getSetting.mockResolvedValue("4999");

    await SettingsService.setDefaultSpeed(2);
    await SettingsService.setHistorySort("oldest");
    await SettingsService.setLanguage("fa");

    expect(setSetting).toHaveBeenCalledWith("settingsUpdatedAt", "5000");
  });

  it("does not dirty shared settings for a device-only preference", async () => {
    await SettingsService.setTheme("dark");
    await SettingsService.setMotionPreference("full");
    await SettingsService.setHapticsEnabled(false);

    expect(setSetting).not.toHaveBeenCalledWith("settingsUpdatedAt", expect.any(String));
  });

  it("applies a newer server snapshot and links its timestamp", async () => {
    getSetting.mockImplementation(async (key) =>
      key === "settingsUpdatedAt" ? "1000" : null
    );
    const listener = jest.fn();
    const unsubscribe = subscribeToSettings(listener);

    await expect(
      SettingsService.applyRemoteSettings({
        languageCode: "fa",
        defaultSpeed: 2,
        historySort: "oldest",
        updatedAt: 1001,
      }),
    ).resolves.toBe(true);

    expect(setSetting).toHaveBeenCalledWith("languageCode", "fa");
    expect(setSetting).toHaveBeenCalledWith("defaultSpeed", "2");
    expect(setSetting).toHaveBeenCalledWith("historySort", "oldest");
    expect(setSetting).toHaveBeenCalledWith("settingsUpdatedAt", "1001");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it("adopts the server value on an equal timestamp, where the server wins", async () => {
    getSetting.mockImplementation(async (key) =>
      key === "settingsUpdatedAt" ? "1000" : null
    );

    await expect(
      SettingsService.applyRemoteSettings({
        languageCode: "fa",
        defaultSpeed: 2,
        historySort: "oldest",
        updatedAt: 1000,
      }),
    ).resolves.toBe(true);

    expect(setSetting).toHaveBeenCalledWith("languageCode", "fa");
    expect(setSetting).toHaveBeenCalledWith("settingsSyncedAt", "1000");
  });

  it("ignores a stale server snapshot", async () => {
    getSetting.mockImplementation(async (key) =>
      key === "settingsUpdatedAt" ? "1000" : null
    );

    await expect(
      SettingsService.applyRemoteSettings({
        languageCode: "fa",
        defaultSpeed: 2,
        historySort: "oldest",
        updatedAt: 999,
      }),
    ).resolves.toBe(false);

    expect(setSetting).not.toHaveBeenCalled();
  });

  it("only reports a change as pending until the server acknowledges it", async () => {
    getSetting.mockImplementation(async (key) => {
      if (key === "settingsUpdatedAt") return "5000";
      if (key === "settingsSyncedAt") return "4999";
      return null;
    });

    expect(await SettingsService.getPendingSharedSettings()).toMatchObject({
      updatedAt: 5000,
    });

    await SettingsService.markSettingsSynced(5000);

    expect(setSetting).toHaveBeenCalledWith("settingsSyncedAt", "5000");
  });

  it("does not regress the acknowledged token", async () => {
    getSetting.mockImplementation(async (key) =>
      key === "settingsSyncedAt" ? "5000" : null
    );

    await SettingsService.markSettingsSynced(4000);

    expect(setSetting).not.toHaveBeenCalledWith("settingsSyncedAt", expect.any(String));
  });

  it("has nothing pending before the listener changes anything", async () => {
    getSetting.mockResolvedValue(null);
    expect(await SettingsService.getPendingSharedSettings()).toBeNull();
  });

  it("never acknowledges past the local token", async () => {
    getSetting.mockImplementation(async (key) => {
      if (key === "settingsUpdatedAt") return "5000";
      if (key === "settingsSyncedAt") return "4000";
      return null;
    });

    await SettingsService.markSettingsSynced(9000);

    expect(setSetting).toHaveBeenCalledWith("settingsSyncedAt", "5000");
  });

  it("re-aligns the token when the server clamps a future clock", async () => {
    getSetting.mockImplementation(async (key) =>
      key === "settingsUpdatedAt" ? "10000" : null
    );

    await expect(
      SettingsService.applyRemoteSettings(
        {
          languageCode: "fa",
          defaultSpeed: 2,
          historySort: "oldest",
          updatedAt: 9000,
        },
        10000,
      ),
    ).resolves.toBe(true);

    expect(setSetting).toHaveBeenCalledWith("settingsUpdatedAt", "9000");
    expect(setSetting).toHaveBeenCalledWith("settingsSyncedAt", "9000");
  });

  it("keeps a change made while the push was in flight", async () => {
    getSetting.mockImplementation(async (key) =>
      key === "settingsUpdatedAt" ? "10001" : null
    );

    await expect(
      SettingsService.applyRemoteSettings(
        {
          languageCode: "fa",
          defaultSpeed: 2,
          historySort: "oldest",
          updatedAt: 9000,
        },
        10000,
      ),
    ).resolves.toBe(false);

    expect(setSetting).not.toHaveBeenCalled();
  });
});

describe("SettingsService last sync", () => {
  it("parses a stored timestamp", async () => {
    getSetting.mockResolvedValue("1700000000000");
    expect(await SettingsService.getLastSyncAt()).toBe(1700000000000);
  });

  it("returns null when unset", async () => {
    getSetting.mockResolvedValue(null);
    expect(await SettingsService.getLastSyncAt()).toBeNull();
  });

  it("persists the timestamp", async () => {
    await SettingsService.setLastSyncAt(42);
    expect(setSetting).toHaveBeenCalledWith("lastSyncAt", "42");
  });
});
