import Constants from "expo-constants";
import * as MediaLibrary from "expo-media-library/legacy";
import { Platform } from "react-native";

import {
  describePermissionRefusal,
  hasAudioPermission,
  isDeviceScanSupported,
  requestAudioPermission,
  type ScanPermission,
} from "@/services/DeviceScanService";

/**
 * `DeviceScanService` only ever takes `Platform` from React Native, and every
 * other native dependency is mocked below — so a two-key stand-in is enough, and
 * it lets each test decide which OS it is running on.
 */
jest.mock("react-native", () => ({ Platform: { OS: "ios" } }));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { executionEnvironment: "bare" },
  ExecutionEnvironment: { Bare: "bare", Standalone: "standalone", StoreClient: "storeClient" },
}));

jest.mock("expo-media-library/legacy", () => ({
  getPermissionsAsync: jest.fn(),
  requestPermissionsAsync: jest.fn(),
}));

jest.mock("expo-file-system/legacy", () => ({
  getInfoAsync: jest.fn(),
  readDirectoryAsync: jest.fn(),
  StorageAccessFramework: {},
}));

jest.mock("@/services/ContentHashService", () => ({
  computeFileContentHash: jest.fn(),
}));

/**
 * Only `granted` and `canAskAgain` are ever read, so the fixture states only
 * those. The real `PermissionResponse.status` is a string *enum*, which no
 * string literal can satisfy — so the mock is narrowed to the slice under test
 * rather than fabricating a status the code never looks at.
 */
type PermissionReply = { granted: boolean; canAskAgain: boolean };

const getPermissionsAsync = MediaLibrary.getPermissionsAsync as unknown as jest.MockedFunction<
  () => Promise<PermissionReply>
>;
const requestPermissionsAsync =
  MediaLibrary.requestPermissionsAsync as unknown as jest.MockedFunction<
    (writeOnly?: boolean, granularPermissions?: string[]) => Promise<PermissionReply>
  >;

const platform = Platform as unknown as { OS: string };
const constants = Constants as unknown as { executionEnvironment: string };

function permission(overrides: Partial<PermissionReply> = {}): PermissionReply {
  return { granted: true, canAskAgain: true, ...overrides };
}

/** The common case: Android, in a build we control. */
beforeEach(() => {
  jest.clearAllMocks();
  platform.OS = "android";
  constants.executionEnvironment = "bare";
});

/** Verbatim from the device: expo-media-library asserts the manifest declaration. */
const UNDECLARED_PERMISSION = new Error(
  "Call to function 'ExpoMediaLibrary.getPermissionsAsync' has been rejected.\n" +
    "-> Caused by: You have requested the AUDIO permission, but it is not declared in " +
    "AndroidManifest. Update expo-media-library config plugin to include the permission " +
    "before requesting it.",
);

describe("isDeviceScanSupported", () => {
  it("is true on Android in a build we control", () => {
    expect(isDeviceScanSupported()).toBe(true);
  });

  it("is false in Expo Go, where the manifest cannot carry the permission", () => {
    constants.executionEnvironment = "storeClient";
    expect(isDeviceScanSupported()).toBe(false);
  });

  it("is false off Android", () => {
    platform.OS = "ios";
    expect(isDeviceScanSupported()).toBe(false);
  });
});

describe("requestAudioPermission", () => {
  it("reports granted without asking again when it is already held", async () => {
    getPermissionsAsync.mockResolvedValue(permission());

    await expect(requestAudioPermission()).resolves.toBe("granted");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("asks the system when it is not held yet", async () => {
    getPermissionsAsync.mockResolvedValue(permission({ granted: false }));
    requestPermissionsAsync.mockResolvedValue(permission());

    await expect(requestAudioPermission()).resolves.toBe("granted");
    expect(requestPermissionsAsync).toHaveBeenCalledWith(false, ["audio"]);
  });

  it("reports denied when the user cannot be asked again", async () => {
    getPermissionsAsync.mockResolvedValue(permission({ granted: false, canAskAgain: false }));

    await expect(requestAudioPermission()).resolves.toBe("denied");
    expect(requestPermissionsAsync).not.toHaveBeenCalled();
  });

  it("reports denied when the user declines the prompt", async () => {
    getPermissionsAsync.mockResolvedValue(permission({ granted: false }));
    requestPermissionsAsync.mockResolvedValue(permission({ granted: false }));

    await expect(requestAudioPermission()).resolves.toBe("denied");
  });

  it("reports unavailable off Android, without reaching the native module", async () => {
    platform.OS = "ios";

    await expect(requestAudioPermission()).resolves.toBe("unavailable");
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("reports unsupported-build in Expo Go, without reaching the native module", async () => {
    constants.executionEnvironment = "storeClient";

    await expect(requestAudioPermission()).resolves.toBe("unsupported-build");
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("maps an undeclared-manifest rejection to unsupported-build", async () => {
    getPermissionsAsync.mockRejectedValue(UNDECLARED_PERMISSION);

    await expect(requestAudioPermission()).resolves.toBe("unsupported-build");
  });

  it("still catches the rejection on the request call, not only the check", async () => {
    getPermissionsAsync.mockResolvedValue(permission({ granted: false }));
    requestPermissionsAsync.mockRejectedValue(UNDECLARED_PERMISSION);

    await expect(requestAudioPermission()).resolves.toBe("unsupported-build");
  });

  it("does not swallow an unrelated native failure", async () => {
    getPermissionsAsync.mockRejectedValue(new Error("Bridge was torn down"));

    await expect(requestAudioPermission()).rejects.toThrow("Bridge was torn down");
  });
});

describe("hasAudioPermission", () => {
  it("reflects the granted flag", async () => {
    getPermissionsAsync.mockResolvedValue(permission());

    await expect(hasAudioPermission()).resolves.toBe(true);
  });

  it("is false in Expo Go rather than throwing", async () => {
    constants.executionEnvironment = "storeClient";

    await expect(hasAudioPermission()).resolves.toBe(false);
    expect(getPermissionsAsync).not.toHaveBeenCalled();
  });

  it("is false when the manifest does not declare the permission", async () => {
    getPermissionsAsync.mockRejectedValue(UNDECLARED_PERMISSION);

    await expect(hasAudioPermission()).resolves.toBe(false);
  });

  it("is false off Android", async () => {
    platform.OS = "ios";

    await expect(hasAudioPermission()).resolves.toBe(false);
  });
});

describe("describePermissionRefusal", () => {
  it("says nothing when access was granted", () => {
    expect(describePermissionRefusal("granted")).toBeNull();
  });

  it("explains an unsupported build without implying the user can fix it in Settings", () => {
    const refusal = describePermissionRefusal("unsupported-build");

    expect(refusal?.title).toBe("Development build required");
    expect(refusal?.message).toContain("Expo Go");
    // Folder import is the escape hatch, so it has to be offered.
    expect(refusal?.message).toContain("Folder import works here");
  });

  it("points a real denial at Settings", () => {
    expect(describePermissionRefusal("denied")?.message).toContain("Settings");
  });

  it("keeps folder import on the table off Android", () => {
    expect(describePermissionRefusal("unavailable")?.message).toContain("pick a folder");
  });

  it("returns a title and a message for every non-granted state", () => {
    const states: ScanPermission[] = ["denied", "unavailable", "unsupported-build"];

    for (const state of states) {
      const refusal = describePermissionRefusal(state);
      expect(refusal?.title).toBeTruthy();
      expect(refusal?.message).toBeTruthy();
    }
  });
});
