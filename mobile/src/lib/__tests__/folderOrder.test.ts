import { sortFoldersByDownload } from "@/lib/folderOrder";
import type { FolderSummary } from "@/lib/db/types";

function folder(name: string, lastDownloadedAt: number | null): FolderSummary {
  return {
    key: name,
    name,
    treeUri: null,
    addedAt: 0,
    lastPlayedAt: null,
    lastDownloadedAt,
    trackCount: 1,
    finishedCount: 0,
    totalDurationSec: 60,
    playCount: 0,
    completedPlayCount: 0,
    artworkUrl: null,
  };
}

describe("sortFoldersByDownload", () => {
  it("puts the most recently downloaded folder first", () => {
    const sorted = sortFoldersByDownload([
      folder("older", 100),
      folder("newest", 300),
      folder("middle", 200),
    ]);

    expect(sorted.map((row) => row.name)).toEqual(["newest", "middle", "older"]);
  });

  it("keeps device folders below every download, in alphabetical order", () => {
    const sorted = sortFoldersByDownload([
      folder("z-device", null),
      folder("downloaded", 50),
      folder("a-device", null),
    ]);

    expect(sorted.map((row) => row.name)).toEqual([
      "downloaded",
      "a-device",
      "z-device",
    ]);
  });

  it("breaks a tie on the name, so the order is stable", () => {
    const sorted = sortFoldersByDownload([
      folder("b", 10),
      folder("a", 10),
    ]);

    expect(sorted.map((row) => row.name)).toEqual(["a", "b"]);
  });

  it("does not mutate the caller's list", () => {
    const input = [folder("older", 1), folder("newer", 2)];
    sortFoldersByDownload(input);

    expect(input.map((row) => row.name)).toEqual(["older", "newer"]);
  });
});
