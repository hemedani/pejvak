import { SettingsService } from "@/services/SettingsService";
import { LocalDBService } from "@/services/LocalDBService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getSetting: jest.fn(),
    setSetting: jest.fn(),
  },
}));

const getSetting = jest.mocked(LocalDBService.getSetting);
const setSetting = jest.mocked(LocalDBService.setSetting);

beforeEach(() => jest.clearAllMocks());

describe("SettingsService.load", () => {
  it("returns defaults when nothing is stored", async () => {
    getSetting.mockResolvedValue(null);
    expect(await SettingsService.load()).toEqual({
      themePreference: "system",
      defaultSpeed: 1,
    });
  });

  it("returns stored values", async () => {
    getSetting.mockImplementation(async (key) =>
      key === "themePreference" ? "dark" : "1.5",
    );
    expect(await SettingsService.load()).toEqual({
      themePreference: "dark",
      defaultSpeed: 1.5,
    });
  });
});

describe("SettingsService setters", () => {
  it("persists the theme and speed", async () => {
    await SettingsService.setTheme("light");
    await SettingsService.setDefaultSpeed(2);

    expect(setSetting).toHaveBeenCalledWith("themePreference", "light");
    expect(setSetting).toHaveBeenCalledWith("defaultSpeed", "2");
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
