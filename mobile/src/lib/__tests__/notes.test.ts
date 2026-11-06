import type { AnnotationWithTrack } from "@/lib/db/types";
import { describeNoteOrigin, describeNoteTags, noteSearchFields } from "@/lib/notes";

function note(overrides: Partial<AnnotationWithTrack["track"]> = {}): AnnotationWithTrack {
  return {
    annotation: {
      id: "a1",
      serverId: null,
      trackId: "t1",
      contentHash: "hash-1",
      positionSec: 90,
      text: "The bit about tides",
      tags: ["history", "lecture"],
      color: null,
      timesPlayedBefore: 0,
      deletedAt: null,
      syncStatus: "synced",
      createdAt: 0,
      updatedAt: 0,
    },
    track: {
      id: "t1",
      title: "Chapter 3",
      author: "Ada",
      contentHash: "hash-1",
      artworkUrl: null,
      origin: "local",
      folderName: null,
      collectionTitle: null,
      ...overrides,
    },
  };
}

describe("noteSearchFields", () => {
  it("indexes the text, the track, the tags and the container", () => {
    const fields = noteSearchFields(note({ folderName: "Lectures" }));
    expect(fields).toEqual([
      { field: "title", value: "The bit about tides" },
      { field: "track", value: "Chapter 3" },
      { field: "description", value: "history lecture" },
      { field: "folder", value: "Lectures" },
    ]);
  });

  it("falls back to the collection when the track has no folder", () => {
    const fields = noteSearchFields(note({ collectionTitle: "Oceanography" }));
    expect(fields.at(-1)).toEqual({ field: "folder", value: "Oceanography" });
  });

  it("leaves the container null rather than inventing one", () => {
    expect(noteSearchFields(note()).at(-1)).toEqual({ field: "folder", value: null });
  });
});

describe("describeNoteTags", () => {
  it("writes every tag with a hash", () => {
    expect(describeNoteTags(["history", "lecture"])).toBe("#history #lecture");
  });

  it("drops empty tags instead of writing a bare hash", () => {
    expect(describeNoteTags(["  ", "history", ""])).toBe("#history");
  });

  it("is null when there are no tags to show", () => {
    expect(describeNoteTags([])).toBeNull();
    expect(describeNoteTags(["   "])).toBeNull();
  });
});

describe("describeNoteOrigin", () => {
  it("names the track alone when it has no container", () => {
    expect(describeNoteOrigin(note())).toBe("Chapter 3");
  });

  it("adds the folder the track sits in", () => {
    expect(describeNoteOrigin(note({ folderName: "Lectures" }))).toBe("Chapter 3 · Lectures");
  });

  it("prefers the folder over the collection", () => {
    expect(describeNoteOrigin(note({ folderName: "Lectures", collectionTitle: "Ocean" }))).toBe(
      "Chapter 3 · Lectures",
    );
  });

  it("does not repeat a container that is already the track's name", () => {
    expect(describeNoteOrigin(note({ folderName: "Chapter 3" }))).toBe("Chapter 3");
  });
});
