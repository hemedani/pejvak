import { StorageAccessFramework, getInfoAsync } from "expo-file-system/legacy";

import { enumerateFolder } from "@/services/DeviceScanService";

/**
 * A granted folder, as Android presents one.
 *
 * The regression this covers is worth spelling out: the walk used to call the
 * module's plain `readDirectoryAsync`, which refuses `content://` URIs, and the
 * throw was swallowed as "an unreadable subdirectory". Picking a folder full of
 * audio therefore imported nothing at all and said nothing about why. These
 * tests fail loudly if the walk ever goes back to an API that cannot read SAF.
 */

jest.mock("react-native", () => ({ Platform: { OS: "android" } }));

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
  StorageAccessFramework: {
    readDirectoryAsync: jest.fn(),
    requestDirectoryPermissionsAsync: jest.fn(),
  },
}));

jest.mock("@/services/ContentHashService", () => ({
  computeFileContentHash: jest.fn(),
}));

const AUTHORITY = "content://com.android.externalstorage.documents";
const ROOT_ID = "primary:Music/Lectures";
const ROOT_TREE = `${AUTHORITY}/tree/${encodeURIComponent(ROOT_ID)}`;

/** A child document URI, the shape a provider's `listFiles()` hands back. */
function documentUri(id: string): string {
  return `${AUTHORITY}/tree/${encodeURIComponent(ROOT_ID)}/document/${encodeURIComponent(id)}`;
}

function treeUri(id: string): string {
  return `${AUTHORITY}/tree/${encodeURIComponent(id)}`;
}

const readSaf = StorageAccessFramework.readDirectoryAsync as jest.Mock;
const stat = getInfoAsync as jest.Mock;

/** What the fake provider knows: one directory per key. */
function provider(directories: Record<string, string[]>) {
  readSaf.mockImplementation(async (uri: string) => {
    const children = directories[uri];
    if (children === undefined) {
      // Exactly what a real provider does for a file: nothing to list.
      throw new Error("not a directory");
    }
    return children;
  });
}

beforeEach(() => {
  jest.clearAllMocks();
  stat.mockResolvedValue({
    exists: true,
    isDirectory: false,
    size: 2048,
    modificationTime: 1_700_000_000,
  });
});

describe("enumerateFolder", () => {
  it("lists the audio files in the granted folder", async () => {
    provider({
      [ROOT_TREE]: [documentUri(`${ROOT_ID}/01.mp3`), documentUri(`${ROOT_ID}/02.m4b`)],
    });

    const found = await enumerateFolder({
      treeUri: ROOT_TREE,
      folderKey: ROOT_ID.slice("primary:".length),
      folderName: "Lectures",
    });

    expect(found.map((file) => file.fileName)).toEqual(["01.mp3", "02.m4b"]);
    expect(found.every((file) => file.source === "saf")).toBe(true);
    expect(found.every((file) => file.folderKey === "Music/Lectures")).toBe(true);
    expect(found[0]?.sizeBytes).toBe(2048);
  });

  it("recurses into a subfolder and keys its files under it", async () => {
    provider({
      [ROOT_TREE]: [
        documentUri(`${ROOT_ID}/01.mp3`),
        documentUri(`${ROOT_ID}/Ch 1`),
      ],
      [treeUri(`${ROOT_ID}/Ch 1`)]: [documentUri(`${ROOT_ID}/Ch 1/02.mp3`)],
    });

    const found = await enumerateFolder({
      treeUri: ROOT_TREE,
      folderKey: "Music/Lectures",
      folderName: "Lectures",
    });

    expect(found.map((file) => file.fileName)).toEqual(["01.mp3", "02.mp3"]);
    expect(found.map((file) => file.folderKey)).toEqual([
      "Music/Lectures",
      "Music/Lectures/Ch 1",
    ]);
    expect(found[1]?.folderName).toBe("Ch 1");
  });

  it("skips artwork and subtitles without trying to read them", async () => {
    provider({
      [ROOT_TREE]: [
        documentUri(`${ROOT_ID}/cover.jpg`),
        documentUri(`${ROOT_ID}/01.mp3`),
        documentUri(`${ROOT_ID}/notes.txt`),
      ],
    });

    const found = await enumerateFolder({
      treeUri: ROOT_TREE,
      folderKey: "Music/Lectures",
      folderName: "Lectures",
    });

    expect(found.map((file) => file.fileName)).toEqual(["01.mp3"]);
  });

  it("returns nothing, rather than throwing, for a folder with no audio", async () => {
    provider({ [ROOT_TREE]: [documentUri(`${ROOT_ID}/cover.jpg`)] });

    await expect(
      enumerateFolder({ treeUri: ROOT_TREE, folderKey: "Music", folderName: "Music" }),
    ).resolves.toEqual([]);
  });

  it("throws a readable message when the granted folder itself cannot be read", async () => {
    // Nothing registered for the root: the grant was revoked, or the provider
    // is one this build cannot list.
    provider({});

    await expect(
      enumerateFolder({ treeUri: ROOT_TREE, folderKey: "Music", folderName: "Music" }),
    ).rejects.toThrow(/could not be read/i);
  });

  it("skips a file the provider says is gone", async () => {
    provider({
      [ROOT_TREE]: [documentUri(`${ROOT_ID}/gone.mp3`), documentUri(`${ROOT_ID}/01.mp3`)],
    });
    stat.mockImplementation(async (uri: string) =>
      uri.includes("gone")
        ? { exists: false, isDirectory: false }
        : { exists: true, isDirectory: false, size: 2048, modificationTime: 0 },
    );

    const found = await enumerateFolder({
      treeUri: ROOT_TREE,
      folderKey: "Music/Lectures",
      folderName: "Lectures",
    });

    expect(found.map((file) => file.fileName)).toEqual(["01.mp3"]);
  });
});
