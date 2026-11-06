import type { LocalPlaylist } from "@/lib/db/types";
import {
  describeOrigin,
  folderOrigin,
  playlistOrigin,
  runOrigin,
  trackOrigin,
  tracksOrigin,
} from "@/lib/origin";

const playlist = (trackIds: string[]): Pick<LocalPlaylist, "items"> => ({
  items: trackIds.map((trackId, order) => ({ trackId, order })),
});

describe("trackOrigin", () => {
  it("reads the track's own column", () => {
    expect(trackOrigin({ origin: "local" })).toBe("local");
    expect(trackOrigin({ origin: "online" })).toBe("online");
  });
});

describe("folderOrigin", () => {
  it("is local for a device folder", () => {
    expect(folderOrigin({ key: "Lectures/Physics" })).toBe("local");
    expect(folderOrigin({ key: "" })).toBe("local");
  });

  it("is online for a downloaded collection or series", () => {
    expect(folderOrigin({ key: "Online/manahej/190" })).toBe("online");
    expect(folderOrigin({ key: "Online/manahej/190::series::7101" })).toBe("online");
  });
});

describe("tracksOrigin", () => {
  it("is unanimous, empty, or mixed", () => {
    expect(tracksOrigin(["local", "local"])).toBe("local");
    expect(tracksOrigin(["online"])).toBe("online");
    expect(tracksOrigin(["local", "online"])).toBe("mixed");
    expect(tracksOrigin([])).toBe("local");
  });
});

describe("playlistOrigin", () => {
  it("follows its members", () => {
    const origins: Record<string, "local" | "online"> = { a: "local", b: "online" };
    expect(playlistOrigin(playlist(["a"]), (id) => origins[id] ?? null)).toBe("local");
    expect(playlistOrigin(playlist(["a", "b"]), (id) => origins[id] ?? null)).toBe("mixed");
  });

  it("ignores members whose track is gone", () => {
    expect(playlistOrigin(playlist(["missing"]), () => null)).toBe("local");
  });
});

describe("runOrigin", () => {
  it("reads the collection's type", () => {
    expect(runOrigin({ contextType: "online", contextKey: "manahej:190" })).toBe("online");
    expect(runOrigin({ contextType: "folder", contextKey: "Online/manahej/190" })).toBe("online");
    expect(runOrigin({ contextType: "folder", contextKey: "Lectures" })).toBe("local");
    expect(runOrigin({ contextType: "playlist", contextKey: "p1" })).toBe("local");
  });
});

describe("describeOrigin", () => {
  it("gives every origin a word", () => {
    expect(describeOrigin("local").label).toBe("Local");
    expect(describeOrigin("online").label).toBe("Online");
    expect(describeOrigin("mixed").label).toBe("Mixed");
  });
});
