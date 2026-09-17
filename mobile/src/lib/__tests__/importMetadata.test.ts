import { EMPTY_AUDIO_TAGS, type AudioTags } from "@/lib/audioTags";
import { resolveTrackMetadata } from "@/lib/importMetadata";

function tags(overrides: Partial<AudioTags>): AudioTags {
  return { ...EMPTY_AUDIO_TAGS, ...overrides };
}

describe("resolveTrackMetadata", () => {
  it("prefers tag values over the filename", () => {
    const resolved = resolveTrackMetadata({
      fileName: "track01.mp3",
      durationSec: 240,
      tags: tags({ title: "Real Title", artist: "Real Artist", album: "Real Album", year: 1999 }),
    });

    expect(resolved).toMatchObject({
      title: "Real Title",
      author: "Real Artist",
      album: "Real Album",
      year: 1999,
    });
  });

  it("falls back to the filename when there are no tags", () => {
    // The lecture case: no tags at all, but a well-formed filename.
    const resolved = resolveTrackMetadata({
      fileName: "03 - Thermodynamics.mp3",
      durationSec: 3600,
      tags: EMPTY_AUDIO_TAGS,
    });

    expect(resolved).toMatchObject({ title: "Thermodynamics", trackNumber: 3, author: null });
  });

  it("takes a track number from the filename when the tag lacks one", () => {
    const resolved = resolveTrackMetadata({
      fileName: "07 - Chapter Seven.mp3",
      durationSec: 600,
      tags: tags({ title: "Chapter Seven", album: "A Book" }),
    });

    expect(resolved.trackNumber).toBe(7);
    expect(resolved.album).toBe("A Book");
  });

  it("prefers a tagged track number over the filename", () => {
    const resolved = resolveTrackMetadata({
      fileName: "07 - Chapter Seven.mp3",
      durationSec: 600,
      tags: tags({ trackNumber: 2 }),
    });

    expect(resolved.trackNumber).toBe(2);
  });

  it("uses the filename stem when neither source yields a title", () => {
    const resolved = resolveTrackMetadata({
      fileName: "recording.m4a",
      durationSec: 60,
      tags: EMPTY_AUDIO_TAGS,
    });

    expect(resolved.title).toBe("recording");
  });

  it("treats a long file as an audiobook", () => {
    expect(
      resolveTrackMetadata({ fileName: "a.mp3", durationSec: 3600, tags: EMPTY_AUDIO_TAGS })
        .isAudiobook,
    ).toBe(true);
    expect(
      resolveTrackMetadata({ fileName: "a.mp3", durationSec: 200, tags: EMPTY_AUDIO_TAGS })
        .isAudiobook,
    ).toBe(false);
  });

  it("treats an .m4b as an audiobook regardless of length", () => {
    expect(
      resolveTrackMetadata({ fileName: "a.m4b", durationSec: 30, tags: EMPTY_AUDIO_TAGS })
        .isAudiobook,
    ).toBe(true);
  });
});
