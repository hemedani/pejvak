import type { LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";
import {
  RelinkService,
  describeStake,
  groupByFolder,
  summariseMissing,
  type MissingTrack,
} from "@/services/RelinkService";

jest.mock("@/services/LocalDBService", () => ({
  LocalDBService: {
    getTracksByAvailability: jest.fn(),
    getTrackActivityCounts: jest.fn(),
  },
}));

const getTracksByAvailability = jest.mocked(LocalDBService.getTracksByAvailability);
const getTrackActivityCounts = jest.mocked(LocalDBService.getTrackActivityCounts);

function track(overrides: Partial<LocalTrack> & { id: string }): LocalTrack {
  return {
    serverId: null,
    contentHash: `hash-${overrides.id}`,
    title: overrides.id,
    fileName: `${overrides.id}.mp3`,
    fileUri: "content://gone",
    durationSec: 600,
    fileSizeBytes: 1_000,
    mimeType: "audio/mpeg",
    isAudiobook: false,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    source: "mediastore",
    sourceUri: "content://gone",
    sourcePath: null,
    sourceSize: 1_000,
    sourceMtime: 0,
    folderKey: null,
    folderName: null,
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "missing",
    ...overrides,
  };
}

function missing(
  id: string,
  stake: Partial<Pick<MissingTrack, "sessionCount" | "listenedSec" | "annotationCount">> = {},
  folder: { folderKey: string | null; folderName: string | null } = {
    folderKey: null,
    folderName: null,
  },
): MissingTrack {
  return {
    track: track({ id, ...folder }),
    sessionCount: 0,
    listenedSec: 0,
    annotationCount: 0,
    ...stake,
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  getTrackActivityCounts.mockResolvedValue(new Map());
});

describe("groupByFolder", () => {
  it("groups by folder and names each group from the folder row", () => {
    const groups = groupByFolder([
      missing("a", {}, { folderKey: "Lectures", folderName: "Lectures" }),
      missing("b", {}, { folderKey: "Lectures", folderName: "Lectures" }),
      missing("c", {}, { folderKey: "Music", folderName: "Music" }),
    ]);

    expect(groups.map((group) => [group.folderName, group.tracks.length])).toEqual([
      ["Lectures", 2],
      ["Music", 1],
    ]);
  });

  it("puts the folderless tracks last, since a folder scan cannot reach them", () => {
    const groups = groupByFolder([
      missing("a", {}, { folderKey: null, folderName: null }),
      missing("b", {}, { folderKey: "Music", folderName: "Music" }),
    ]);

    expect(groups.map((group) => group.folderName)).toEqual(["Music", "No folder"]);
  });

  it("falls back to the key when a folder row was never created", () => {
    // A folder reached through the media index has no `folders` row of its own.
    const groups = groupByFolder([
      missing("a", {}, { folderKey: "Downloads/Podcasts", folderName: null }),
    ]);

    expect(groups[0].folderName).toBe("Downloads/Podcasts");
  });

  it("keeps a single group when every track shares a folder", () => {
    const groups = groupByFolder([
      missing("a", {}, { folderKey: "Lectures", folderName: "Lectures" }),
      missing("b", {}, { folderKey: "Lectures", folderName: "Lectures" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].tracks.map((item) => item.track.id)).toEqual(["a", "b"]);
  });

  it("returns nothing for nothing", () => {
    expect(groupByFolder([])).toEqual([]);
  });
});

describe("describeStake", () => {
  it("says nothing when nothing is recorded", () => {
    // A track that was imported and never played has no history to lose, so a
    // row of zeroes would only add noise.
    expect(describeStake(missing("a"))).toBeNull();
  });

  it("counts sessions, listening time and notes", () => {
    const stake = describeStake(missing("a", { sessionCount: 14, listenedSec: 5400, annotationCount: 3 }));

    expect(stake).toBe("14 sessions · 1h 30m listened · 3 notes");
  });

  it("singularises one of each", () => {
    expect(describeStake(missing("a", { sessionCount: 1, annotationCount: 1 }))).toBe(
      "1 session · 1 note",
    );
  });

  it("omits the parts that are zero", () => {
    expect(describeStake(missing("a", { listenedSec: 900 }))).toBe("15m listened");
  });
});

describe("summariseMissing", () => {
  it("says so plainly when nothing is missing", () => {
    expect(summariseMissing([])).toBe("Every file is where it should be.");
  });

  it("counts the files and what they are holding", () => {
    const summary = summariseMissing([
      missing("a", { listenedSec: 1800 }),
      missing("b", { listenedSec: 3600 }),
    ]);

    expect(summary).toBe("2 files missing · 1h 30m of listening at stake");
  });

  it("leaves out the listening figure when there is none", () => {
    expect(summariseMissing([missing("a")])).toBe("1 file missing");
  });
});

describe("RelinkService.listMissing", () => {
  it("asks only for the missing rows", async () => {
    getTracksByAvailability.mockResolvedValue([]);

    await RelinkService.listMissing();

    expect(getTracksByAvailability).toHaveBeenCalledWith("missing");
  });

  it("attaches what is recorded against each track", async () => {
    getTracksByAvailability.mockResolvedValue([track({ id: "a" }), track({ id: "b" })]);
    getTrackActivityCounts.mockResolvedValue(
      new Map([["a", { sessionCount: 14, listenedSec: 5400, annotationCount: 3 }]]),
    );

    const rows = await RelinkService.listMissing();

    expect(rows[0]).toMatchObject({ sessionCount: 14, listenedSec: 5400, annotationCount: 3 });
    // A track the query returned nothing for is not an error; it is a track
    // that was never played.
    expect(rows[1]).toMatchObject({ sessionCount: 0, listenedSec: 0, annotationCount: 0 });
  });

  it("reads the counts in one query for the whole set", async () => {
    getTracksByAvailability.mockResolvedValue([track({ id: "a" }), track({ id: "b" })]);

    await RelinkService.listMissing();

    expect(getTrackActivityCounts).toHaveBeenCalledTimes(1);
    expect(getTrackActivityCounts).toHaveBeenCalledWith(["a", "b"]);
  });

  it("skips the count query entirely when nothing is missing", async () => {
    getTracksByAvailability.mockResolvedValue([]);

    expect(await RelinkService.listMissing()).toEqual([]);
    expect(getTrackActivityCounts).toHaveBeenCalledWith([]);
  });
});
