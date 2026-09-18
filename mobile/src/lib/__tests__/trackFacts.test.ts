import { EMPTY_AUDIO_INFO, type AudioInfo } from "@/lib/audioInfo";
import { EMPTY_AUDIO_TAG_BUNDLE, EMPTY_AUDIO_TAG_DETAILS } from "@/lib/audioTags";
import type { LocalTrack } from "@/lib/db/types";
import {
  buildAudioFacts,
  buildFileFacts,
  buildPlaybackFacts,
  buildTagFacts,
  buildTrackFactSections,
  describeAvailability,
  describeSyncStatus,
  describeTrackSource,
  formatBitrate,
  formatChannels,
  formatSampleRate,
} from "@/lib/trackFacts";
import type { SessionSummary, TrackStats } from "@/lib/trackStats";

function track(overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id: "t1",
    serverId: null,
    title: "Chapter One",
    fileName: "chapter one.mp3",
    fileUri: "content://media/external/audio/media/42",
    durationSec: 600,
    fileSizeBytes: 9_600_000,
    mimeType: "audio/mpeg",
    isAudiobook: true,
    author: "An Author",
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 3,
    totalListenTimeSec: 1800,
    lastPlayedAt: 1_700_000_000_000,
    syncStatus: "synced",
    createdAt: 1_699_000_000_000,
    updatedAt: 1_699_500_000_000,
    source: "mediastore",
    sourceUri: "content://media/external/audio/media/42",
    sourcePath: null,
    sourceSize: 9_600_000,
    sourceMtime: 1_698_000_000_000,
    folderKey: "Lectures",
    folderName: "Lectures",
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
    contentHash: "a".repeat(64),
    ...overrides,
  };
}

function stats(overrides: Partial<TrackStats> = {}): TrackStats {
  return {
    playCount: 3,
    totalListenTimeSec: 1800,
    lastPlayedAt: 1_700_000_000_000,
    completionRate: 2 / 3,
    annotationCount: 4,
    ...overrides,
  };
}

function summary(overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    finishedCount: 3,
    completedCount: 2,
    interruptedCount: 1,
    openCount: 0,
    totalListenedSec: 1800,
    longestSec: 900,
    averageSec: 600,
    firstStartedAt: 1_699_000_000_000,
    lastActivityAt: 1_700_000_000_000,
    daysListened: 2,
    speeds: [1, 1.5],
    ...overrides,
  };
}

/** Every label/value pair in a section, for order-free lookups. */
function asMap(facts: { label: string; value: string }[]): Record<string, string> {
  return Object.fromEntries(facts.map((fact) => [fact.label, fact.value]));
}

describe("formatSampleRate", () => {
  it("drops the decimal on a whole kilohertz and keeps it otherwise", () => {
    expect(formatSampleRate(44_100)).toBe("44.1 kHz");
    expect(formatSampleRate(48_000)).toBe("48 kHz");
  });

  it("returns null rather than a placeholder for a rate it does not have", () => {
    expect(formatSampleRate(null)).toBeNull();
    expect(formatSampleRate(0)).toBeNull();
  });
});

describe("formatBitrate", () => {
  it("says which kind of bitrate it is, because the number alone is ambiguous", () => {
    expect(formatBitrate(128, false)).toBe("128 kbps (CBR)");
    expect(formatBitrate(96, true)).toBe("96 kbps (VBR)");
  });

  it("returns null for a bitrate the header did not declare", () => {
    expect(formatBitrate(null, false)).toBeNull();
    expect(formatBitrate(0, false)).toBeNull();
  });
});

describe("formatChannels", () => {
  it("pairs the count with the mode when the header names one", () => {
    expect(formatChannels(2, "Stereo")).toBe("2 (Stereo)");
    expect(formatChannels(1, null)).toBe("1");
  });

  it("returns null rather than zero channels", () => {
    expect(formatChannels(null, "Stereo")).toBeNull();
    expect(formatChannels(0, null)).toBeNull();
  });
});

describe("describers", () => {
  it("names where the file came from", () => {
    expect(describeTrackSource("mediastore")).toBe("Device media index");
    expect(describeTrackSource("saf")).toBe("Granted folder");
    expect(describeTrackSource("picker")).toBe("File picker");
    expect(describeTrackSource(null)).toBe("Imported file");
  });

  it("says a missing file is missing, since that is the actionable state", () => {
    expect(describeAvailability("missing")).toBe("File missing");
    expect(describeAvailability("present")).toBe("Available");
  });

  it("distinguishes a sync that failed from one that has not started", () => {
    expect(describeSyncStatus("synced")).toBe("Synced");
    expect(describeSyncStatus("syncing")).toBe("Syncing…");
    expect(describeSyncStatus("failed")).toBe("Not synced — will retry");
    expect(describeSyncStatus("pending")).toBe("Waiting to sync");
  });
});

describe("buildAudioFacts", () => {
  it("returns nothing at all when the header told us nothing", () => {
    // The rule the whole panel rests on: no value means no row, never a dash.
    const bare = track({ durationSec: 0, fileSizeBytes: 0 });
    expect(buildAudioFacts(bare, EMPTY_AUDIO_INFO, { bytes: null, mime: null })).toEqual([]);
  });

  it("reports what the stream declares", () => {
    const info: AudioInfo = {
      container: "MPEG-4",
      codec: "AAC LC",
      bitrateKbps: 128,
      variableBitrate: true,
      sampleRateHz: 44_100,
      channels: 2,
      channelMode: "Stereo",
      bitsPerSample: null,
      durationSec: 600,
    };

    const facts = asMap(buildAudioFacts(track(), info, { bytes: 512_000, mime: "image/jpeg" }));

    expect(facts.Container).toBe("MPEG-4");
    expect(facts.Codec).toBe("AAC LC");
    expect(facts.Bitrate).toBe("128 kbps (VBR)");
    expect(facts["Sample rate"]).toBe("44.1 kHz");
    expect(facts.Channels).toBe("2 (Stereo)");
    expect(facts.Duration).toBe("10:00");
    expect(facts["Cover format"]).toBe("JPEG");
    expect(facts["Cover art"]).toBeDefined();
  });

  it("surfaces a duration the library and the file disagree about", () => {
    const info: AudioInfo = { ...EMPTY_AUDIO_INFO, durationSec: 900 };
    const facts = asMap(buildAudioFacts(track({ durationSec: 600 }), info, { bytes: null, mime: null }));

    // The stream is the authority, so it is the unnamed row; the library's
    // figure is labelled as such rather than silently discarded.
    expect(facts.Duration).toBe("15:00");
    expect(facts["Duration (library)"]).toBe("10:00");
  });

  it("stays quiet when the two durations agree within a second", () => {
    const info: AudioInfo = { ...EMPTY_AUDIO_INFO, durationSec: 600 };
    const facts = asMap(buildAudioFacts(track({ durationSec: 600 }), info, { bytes: null, mime: null }));

    expect(facts.Duration).toBe("10:00");
    expect(facts["Duration (library)"]).toBeUndefined();
  });

  it("labels the bitrate it computed as an average, so it cannot be mistaken for a declared one", () => {
    const info: AudioInfo = { ...EMPTY_AUDIO_INFO, durationSec: 600 };
    // 9,600,000 bytes over 600 s = 128 kbps.
    const facts = asMap(buildAudioFacts(track({ fileSizeBytes: 9_600_000 }), info, { bytes: null, mime: null }));

    expect(facts["Average bitrate"]).toBe("128 kbps");
  });

  it("omits the average when there is no size or no duration to divide by", () => {
    const info: AudioInfo = { ...EMPTY_AUDIO_INFO, durationSec: 600 };
    const facts = asMap(buildAudioFacts(track({ fileSizeBytes: 0 }), info, { bytes: null, mime: null }));
    expect(facts["Average bitrate"]).toBeUndefined();
  });
});

describe("buildTagFacts", () => {
  it("falls back to the library's own title and artist when the tag is silent", () => {
    const facts = asMap(buildTagFacts(track(), EMPTY_AUDIO_TAG_DETAILS, EMPTY_AUDIO_TAG_BUNDLE));

    expect(facts.Title).toBe("Chapter One");
    expect(facts.Artist).toBe("An Author");
    // No tag means nothing to say about the tag itself.
    expect(facts.Tag).toBeUndefined();
    expect(facts["Tag frames"]).toBeUndefined();
  });

  it("reads the chapter from the movement pair audiobooks actually use", () => {
    const bundle = {
      ...EMPTY_AUDIO_TAG_BUNDLE,
      tags: { ...EMPTY_AUDIO_TAG_BUNDLE.tags, movement: "Chapter Four", movementNumber: 4 },
      tagVersion: "ID3v2.3",
      frameCount: 9,
    };

    const facts = asMap(buildTagFacts(track(), EMPTY_AUDIO_TAG_DETAILS, bundle));

    expect(facts.Chapter).toBe("Chapter Four");
    expect(facts["Chapter number"]).toBe("4");
    expect(facts.Tag).toBe("ID3v2.3");
    expect(facts["Tag frames"]).toBe("9");
  });

  it("counts lyrics lines rather than dumping the lyrics into the panel", () => {
    const details = { ...EMPTY_AUDIO_TAG_DETAILS, lyrics: "First\n\nSecond\nThird\n" };
    expect(asMap(buildTagFacts(track(), details, EMPTY_AUDIO_TAG_BUNDLE)).Lyrics).toBe("3 lines");
  });

  it("says '1 line' for a single line", () => {
    const details = { ...EMPTY_AUDIO_TAG_DETAILS, lyrics: "Only one" };
    expect(asMap(buildTagFacts(track(), details, EMPTY_AUDIO_TAG_BUNDLE)).Lyrics).toBe("1 line");
  });

  it("joins the disc and track numbers only when there is a disc", () => {
    const plain = asMap(
      buildTagFacts(track({ trackNumber: 7 }), EMPTY_AUDIO_TAG_DETAILS, EMPTY_AUDIO_TAG_BUNDLE),
    );
    expect(plain.Track).toBe("7");

    const withDisc = asMap(
      buildTagFacts(track({ trackNumber: 7, discNumber: 2 }), EMPTY_AUDIO_TAG_DETAILS, EMPTY_AUDIO_TAG_BUNDLE),
    );
    expect(withDisc.Track).toBe("2.7");
  });
});

describe("buildFileFacts", () => {
  it("marks the values that exist to be copied out", () => {
    const facts = buildFileFacts(track());
    const location = facts.find((fact) => fact.label === "Location");
    const hash = facts.find((fact) => fact.label === "Content hash");

    // A 64-character hash is on screen so it can be pasted somewhere, which
    // means it has to be selectable and set apart from prose.
    expect(location?.technical).toBe(true);
    expect(hash?.technical).toBe(true);
    expect(hash?.value).toBe("a".repeat(64));
  });

  it("falls back to the folder key when the folder has no display name", () => {
    const facts = asMap(buildFileFacts(track({ folderName: null, folderKey: "Lectures/Physics" })));
    expect(facts.Folder).toBe("Lectures/Physics");
  });
});

describe("buildPlaybackFacts", () => {
  it("says a track is playing now rather than inventing a count for it", () => {
    const facts = asMap(buildPlaybackFacts(track(), stats(), summary({ openCount: 1 })));
    expect(facts["In progress"]).toBe("Playing now");
  });

  it("omits the in-progress row when nothing is open", () => {
    const facts = asMap(buildPlaybackFacts(track(), stats(), summary()));
    expect(facts["In progress"]).toBeUndefined();
  });

  it("states the speeds the track has actually been heard at", () => {
    const facts = asMap(buildPlaybackFacts(track(), stats(), summary({ speeds: [1, 1.25, 1.5] })));
    expect(facts["Speeds used"]).toBe("1×, 1.25×, 1.5×");
  });

  it("omits completion when no session has finished, so 0% is never shown as a failure", () => {
    const facts = asMap(
      buildPlaybackFacts(track(), stats(), summary({ finishedCount: 0, completedCount: 0 })),
    );
    expect(facts.Completion).toBeUndefined();
    expect(facts.Finished).toBe("0");
  });

  it("prefers the library's lifetime count over the sessions on hand", () => {
    const facts = asMap(buildPlaybackFacts(track({ totalPlayCount: 41 }), stats(), summary()));
    expect(facts["Lifetime plays recorded"]).toBe("41");
  });
});

describe("buildTrackFactSections", () => {
  const input = {
    track: track(),
    stats: stats(),
    summary: summary(),
    info: EMPTY_AUDIO_INFO,
    details: EMPTY_AUDIO_TAG_DETAILS,
    tag: EMPTY_AUDIO_TAG_BUNDLE,
    artworkBytes: null,
    artworkMime: null,
  };

  it("keeps the four sections in reading order", () => {
    const titles = buildTrackFactSections(input).map((section) => section.title);
    expect(titles).toEqual(["PLAYBACK", "AUDIO", "TAGS", "FILE"]);
  });

  it("drops a section with nothing in it instead of rendering an empty heading", () => {
    // With no stream info and no size, AUDIO has nothing to say.
    const sections = buildTrackFactSections({
      ...input,
      track: track({ durationSec: 0, fileSizeBytes: 0 }),
    });

    expect(sections.map((section) => section.title)).toEqual(["PLAYBACK", "TAGS", "FILE"]);
  });

  it("never emits a row whose value is a placeholder", () => {
    const values = buildTrackFactSections(input).flatMap((section) =>
      section.facts.map((fact) => fact.value),
    );

    expect(values.length).toBeGreaterThan(0);
    for (const value of values) {
      expect(value.trim()).not.toBe("");
      expect(value).not.toBe("—");
      expect(value).not.toBe("-");
      expect(value).not.toBe("null");
      expect(value).not.toBe("undefined");
      expect(value).not.toContain("NaN");
    }
  });
});
