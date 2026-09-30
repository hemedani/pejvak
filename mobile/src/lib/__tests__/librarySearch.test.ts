/**
 * What the Library's search can find.
 *
 * `search.test.ts` proves the matching engine works. This file proves the app
 * asks it the right questions — that a file whose tags were never filled in is
 * still findable by its name on disk and by the folder it lives in, and that an
 * online course is findable by the course rather than by a URL that expires.
 *
 * These are the decisions a `renderItem` would have hidden.
 */

import type { FolderSummary, LocalPlaylist, LocalTrack } from "@/lib/db/types";
import {
  folderSearchFields,
  playlistSearchFields,
  recentSearchFields,
  TITLE_FIELD,
  trackSearchFields,
} from "@/lib/librarySearch";
import { createSearchIndex, foldQuery, searchItems, type SearchFieldName } from "@/lib/search";

const BASE_TRACK: Omit<LocalTrack, "id"> = {
  serverId: null,
  contentHash: "hash",
  title: "Untitled",
  fileName: null,
  fileUri: null,
  durationSec: 600,
  fileSizeBytes: 0,
  mimeType: null,
  isAudiobook: true,
  author: null,
  narrator: null,
  artworkUrl: null,
  totalPlayCount: 0,
  totalListenTimeSec: 0,
  lastPlayedAt: null,
  syncStatus: "pending",
  createdAt: 0,
  updatedAt: 0,
  source: "saf",
  sourceUri: null,
  sourcePath: null,
  sourceSize: null,
  sourceMtime: null,
  folderKey: null,
  folderName: null,
  album: null,
  trackNumber: null,
  discNumber: null,
  year: null,
  availability: "present",
  origin: "local",
  streamUrl: null,
  sourceId: null,
  externalId: null,
  collectionKey: null,
  collectionTitle: null,
  downloadedAt: null,
  downloadPath: null,
};

function track(id: string, overrides: Partial<LocalTrack> = {}): LocalTrack {
  return { ...BASE_TRACK, id, ...overrides };
}

function folder(key: string, name: string): FolderSummary {
  return {
    key,
    name,
    treeUri: null,
    addedAt: 0,
    lastPlayedAt: null,
    trackCount: 4,
    finishedCount: 1,
    totalDurationSec: 2400,
    playCount: 2,
    completedPlayCount: 0,
    artworkUrl: null,
  };
}

function playlist(id: string, title: string, description: string | null = null): LocalPlaylist {
  return {
    id,
    serverId: null,
    title,
    description,
    isPublic: false,
    items: [],
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

/** The field names a row is actually searchable by. */
function namesOf(fields: { field: SearchFieldName }[]): SearchFieldName[] {
  return fields.map((entry) => entry.field);
}

describe("trackSearchFields", () => {
  it("finds a file by its name on disk, not only by its tags", () => {
    // The brief asks for "music *and files*": a file whose tags were never
    // filled in has a title the importer guessed, and a name the listener gave
    // it themselves.
    const bare = track("t1", { title: "Track 04", fileName: "فصل چهارم.mp3" });
    expect(namesOf(trackSearchFields(bare))).toContain("fileName");
  });

  it("finds a file by the folder it sits in", () => {
    const filed = track("t2", { folderKey: "Lectures/Physics", folderName: "Physics" });
    expect(namesOf(trackSearchFields(filed))).toEqual(
      expect.arrayContaining(["folder", "path"]),
    );
  });

  it("falls back to the full device path when no folder key is known", () => {
    // Imported by the document picker, so the folder was never derived.
    const picked = track("t3", { sourcePath: "/storage/emulated/0/Download/درس.mp3" });
    const path = trackSearchFields(picked).find((entry) => entry.field === "path");
    expect(path?.value).toBe("/storage/emulated/0/Download/درس.mp3");
  });

  it("names the course as the folder for a streamed track", () => {
    // A downloaded course keeps its `origin` forever but has a `folderName`;
    // a streamed one has neither a folder nor a path — its container is the
    // collection it came from.
    const streamed = track("t4", {
      origin: "online",
      sourceId: "manahej",
      externalId: "900",
      collectionKey: "manahej:190",
      collectionTitle: "تاریخ شیعه",
      streamUrl: "https://cdn.example/audio.mp3?token=abc",
    });
    const entries = trackSearchFields(streamed);
    expect(entries.find((entry) => entry.field === "folder")?.value).toBe("تاریخ شیعه");
  });

  it("never indexes the stream URL", () => {
    // A signed, expiring URL is how to reach the audio right now, not what the
    // audio is. Indexing it would put a changing token in the results — and
    // make a search for "token" match half the library.
    const streamed = track("t5", {
      origin: "online",
      streamUrl: "https://cdn.example/audio.mp3?token=SECRETVALUE",
    });
    const values = trackSearchFields(streamed).map((entry) => entry.value);
    expect(values.some((value) => value?.includes("SECRETVALUE") ?? false)).toBe(false);
  });

  it("leaves out the fields a row has not got", () => {
    // A plain music file with no album and no narrator contributes only the
    // fields it can answer for. `trackSearchFields` still reports the rest as
    // null — it is describing the schema — and the index is what drops them.
    const bare = track("t6", { title: "آهنگ", fileName: "song.mp3" });
    const [entry] = createSearchIndex([bare], trackSearchFields, TITLE_FIELD);
    expect(entry.fields.map((field) => field.field)).toEqual(["title", "fileName"]);
  });
});

describe("folderSearchFields", () => {
  it("finds a folder by its name and by its path", () => {
    // Two folders both called "Lectures" are told apart by nothing else.
    const nested = folder("Lectures/Physics", "Physics");
    expect(namesOf(folderSearchFields(nested))).toEqual(["title", "path"]);
    expect(folderSearchFields(nested).find((entry) => entry.field === "path")?.value).toBe(
      "Lectures/Physics",
    );
  });

  it("reports the storage root's empty key as no value at all", () => {
    // The root folder's key is the empty string — a stand-in for "no folder",
    // not a name. The field list reports it, because that is what the column
    // holds; the index drops it, because a value that can never match is not a
    // field the listener can search by.
    const root = folder("", "Internal storage");
    expect(folderSearchFields(root).find((entry) => entry.field === "path")?.value).toBe("");
    const [entry] = createSearchIndex([root], folderSearchFields, TITLE_FIELD);
    expect(entry.fields.map((field) => field.field)).toEqual(["title"]);
  });

  it("composes with the engine, so a folder is found by its name and highlighted", () => {
    const hits = searchItems(
      [folder("Lectures/Physics", "فیزیک")],
      foldQuery("فیزیک"),
      folderSearchFields,
      TITLE_FIELD,
    );
    expect(hits).toHaveLength(1);
    expect(hits[0].field).toBe("title");
    expect(hits[0].ranges).toEqual([{ start: 0, end: 5 }]);
  });
});

describe("playlistSearchFields", () => {
  it("finds a playlist by the description the listener wrote", () => {
    const notes = playlist("p1", "برای شب", "آرام و بی‌کلام");
    expect(namesOf(playlistSearchFields(notes))).toEqual(["title", "description"]);
  });
});

describe("recentSearchFields", () => {
  it("searches each kind of recent row by what that row actually is", () => {
    // The Recent tab is a union, so searching it by another branch's fields
    // would be searching fields the row has not got.
    const asFolder = recentSearchFields({
      kind: "folder",
      folder: folder("Lectures", "Lectures"),
      lastPlayedAt: 0,
    });
    expect(namesOf(asFolder)).toEqual(["title", "path"]);

    const asPlaylist = recentSearchFields({
      kind: "playlist",
      playlist: playlist("p1", "برای شب", "آرام"),
      lastPlayedAt: 0,
    });
    expect(namesOf(asPlaylist)).toEqual(["title", "description"]);

    const asTrack = recentSearchFields({
      kind: "track",
      track: track("t1", { fileName: "song.mp3" }),
      lastPlayedAt: 0,
    });
    expect(namesOf(asTrack)).toContain("fileName");
  });
});
