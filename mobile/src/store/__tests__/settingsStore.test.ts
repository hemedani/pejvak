import { DEFAULT_SETTINGS } from "@/lib/settings";
import { SettingsService, subscribeToSettings } from "@/services/SettingsService";
import { useSettingsStore } from "@/store/settingsStore";

jest.mock("@/services/SettingsService", () => ({
  SettingsService: {
    load: jest.fn(),
    setLanguage: jest.fn(async () => undefined),
  },
  subscribeToSettings: jest.fn(() => () => undefined),
}));

const load = jest.mocked(SettingsService.load);
// Captured before `beforeEach` clears the mock: this is the callback the store
// registered for a server snapshot winning.
const settingsListener = jest.mocked(subscribeToSettings).mock.calls[0]?.[0];

beforeEach(() => {
  jest.clearAllMocks();
  useSettingsStore.setState({ ...DEFAULT_SETTINGS, loaded: false });
});

describe("settingsStore.load", () => {
  it("applies the stored language", async () => {
    load.mockResolvedValue({ ...DEFAULT_SETTINGS, languageCode: "fa" });

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().languageCode).toBe("fa");
    expect(useSettingsStore.getState().loaded).toBe(true);
  });

  it("still marks settings loaded when the read fails", async () => {
    load.mockRejectedValue(new Error("database unavailable"));

    await useSettingsStore.getState().load();

    expect(useSettingsStore.getState().loaded).toBe(true);
    expect(useSettingsStore.getState().languageCode).toBeNull();
  });

  it("reloads when a remote settings snapshot wins", () => {
    settingsListener?.();

    expect(load).toHaveBeenCalledTimes(1);
  });
});
