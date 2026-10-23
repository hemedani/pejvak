import type { LocalTrack } from "@/lib/db/types";
import { describeTrackStatus } from "@/lib/trackStatus";

function track(
  overrides: Partial<Pick<LocalTrack, "availability" | "fileUri">>,
): Pick<LocalTrack, "availability" | "fileUri"> {
  return {
    availability: "present",
    fileUri: "file:///storage/Music/chapter.mp3",
    ...overrides,
  };
}

describe("describeTrackStatus", () => {
  it("marks a missing file in the danger tone before anything else", () => {
    expect(describeTrackStatus(track({ availability: "missing" }))).toEqual({
      kind: "missing",
      label: "File missing",
    });
  });

  it("says a track streams only while its location is a URL", () => {
    expect(
      describeTrackStatus(track({ fileUri: "https://archive.org/download/a.mp3" })),
    ).toEqual({ kind: "streamed", label: "Streams" });
  });

  it("says nothing about a local file that is present", () => {
    expect(describeTrackStatus(track({}))).toBeNull();
    expect(describeTrackStatus(track({ fileUri: null }))).toBeNull();
  });

  it("stops calling a downloaded online track a stream", () => {
    expect(
      describeTrackStatus(track({ fileUri: "file:///data/Online/course/01.mp3" })),
    ).toBeNull();
  });
});
