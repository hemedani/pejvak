/**
 * Everything the app knows about one track, assembled into labelled rows.
 *
 * The details screen is a list of facts and nothing else, so the facts are
 * built here rather than inside the component: this way the assembly is a pure
 * function that can be tested without rendering, and the screen stays a layout.
 *
 * The governing rule is that a fact with no value is **omitted**, never printed
 * as a dash. A lecture recording with no ID3 tag has no album, no composer and
 * no genre, and a panel that lists sixteen rows of "—" tells the reader nothing
 * while burying the six things it does know.
 */

import type { AudioInfo } from "@/lib/audioInfo";
import type { AudioTagBundle, AudioTagDetails } from "@/lib/audioTags";
import type { LocalTrack, TrackAvailability, TrackSource } from "@/lib/db/types";
import { formatDuration } from "@/lib/history";
import { formatBytes } from "@/lib/settings";
import { formatClock } from "@/lib/time";
import type { SessionSummary, TrackStats } from "@/lib/trackStats";

export type Fact = {
  label: string;
  value: string;
  /**
   * An exact, copyable value — a path, a hash. Rendered in the numeric face and
   * selectable, because the reason to show a 64-character hash is to let
   * someone paste it somewhere.
   */
  technical?: boolean;
};

export type FactSection = {
  title: string;
  facts: Fact[];
};

/** Adds a row, skipping anything the file did not actually say. */
function push(facts: Fact[], label: string, value: string | null | undefined, technical = false): void {
  const text = typeof value === "string" ? value.trim() : value;
  if (text === null || text === undefined || text === "") {
    return;
  }
  facts.push({ label, value: String(text), ...(technical ? { technical: true } : {}) });
}

function pushNumber(facts: Fact[], label: string, value: number | null | undefined, suffix = ""): void {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return;
  }
  facts.push({ label, value: `${value}${suffix}` });
}

// --- Describers -----------------------------------------------------------

export function describeTrackSource(source: TrackSource | null): string {
  switch (source) {
    case "mediastore":
      return "Device media index";
    case "saf":
      return "Granted folder";
    case "picker":
      return "File picker";
    default:
      return "Imported file";
  }
}

export function describeAvailability(availability: TrackAvailability): string {
  return availability === "missing" ? "File missing" : "Available";
}

export function describeSyncStatus(status: LocalTrack["syncStatus"]): string {
  switch (status) {
    case "synced":
      return "Synced";
    case "syncing":
      return "Syncing…";
    case "failed":
      return "Not synced — will retry";
    default:
      return "Waiting to sync";
  }
}

export function formatDateTime(value: number | null | undefined): string | null {
  return value ? new Date(value).toLocaleString() : null;
}

/** `44100` → `44.1 kHz`; `48000` → `48 kHz`. */
export function formatSampleRate(hz: number | null): string | null {
  if (!hz || hz <= 0) {
    return null;
  }
  const khz = hz / 1000;
  return `${Number.isInteger(khz) ? khz : khz.toFixed(1)} kHz`;
}

/** `128` + VBR → `128 kbps (VBR)`. */
export function formatBitrate(kbps: number | null, variable: boolean): string | null {
  if (!kbps || kbps <= 0) {
    return null;
  }
  return `${kbps} kbps (${variable ? "VBR" : "CBR"})`;
}

/** `2` + `Stereo` → `2 (Stereo)`. */
export function formatChannels(channels: number | null, mode: string | null): string | null {
  if (!channels) {
    return null;
  }
  return mode ? `${channels} (${mode})` : String(channels);
}

/** Percentage with no decimals — a details panel is not a chart. */
export function formatPercent(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

// --- Section builders -----------------------------------------------------

/** What the listener has done with this track. */
export function buildPlaybackFacts(
  track: LocalTrack,
  stats: TrackStats,
  summary: SessionSummary,
): Fact[] {
  const facts: Fact[] = [];

  pushNumber(facts, "Sessions", summary.finishedCount);
  if (summary.openCount > 0) {
    push(facts, "In progress", "Playing now");
  }
  pushNumber(facts, "Finished", summary.completedCount);
  if (summary.finishedCount > 0) {
    push(facts, "Completion", formatPercent(stats.completionRate));
  }
  push(facts, "Total listened", summary.totalListenedSec > 0 ? formatDuration(summary.totalListenedSec) : null);
  push(facts, "Longest session", summary.longestSec > 0 ? formatDuration(summary.longestSec) : null);
  push(facts, "Average session", summary.averageSec > 0 ? formatDuration(summary.averageSec) : null);
  pushNumber(facts, "Interrupted", summary.interruptedCount);
  pushNumber(facts, "Days listened", summary.daysListened);
  if (summary.speeds.length > 0) {
    push(facts, "Speeds used", summary.speeds.map((speed) => `${speed}×`).join(", "));
  }
  push(facts, "First played", formatDateTime(summary.firstStartedAt));
  push(facts, "Last played", formatDateTime(summary.lastActivityAt));
  pushNumber(facts, "Notes", stats.annotationCount);
  push(facts, "Lifetime plays recorded", track.totalPlayCount > 0 ? String(track.totalPlayCount) : null);

  return facts;
}

/**
 * What the audio stream itself declares, plus the two numbers that are derived
 * rather than declared — and are labelled as such.
 */
export function buildAudioFacts(
  track: LocalTrack,
  info: AudioInfo,
  artwork: { bytes: number | null; mime: string | null },
): Fact[] {
  const facts: Fact[] = [];

  push(facts, "Container", info.container);
  push(facts, "Codec", info.codec);
  push(facts, "Bitrate", formatBitrate(info.bitrateKbps, info.variableBitrate));
  push(facts, "Sample rate", formatSampleRate(info.sampleRateHz));
  push(facts, "Channels", formatChannels(info.channels, info.channelMode));
  pushNumber(facts, "Bit depth", info.bitsPerSample, " bit");

  const durationSec = info.durationSec ?? (track.durationSec > 0 ? track.durationSec : null);
  push(facts, "Duration", durationSec ? formatClock(Math.round(durationSec)) : null);
  if (info.durationSec && track.durationSec > 0 && Math.abs(info.durationSec - track.durationSec) > 1) {
    // The two disagreeing is worth saying out loud: it is how a file that was
    // re-encoded, or a media index that guessed, becomes visible.
    push(facts, "Duration (library)", formatClock(track.durationSec));
  }

  // Derived, not declared — so it is named as an average and never overwrites
  // the stream's own figure.
  if (durationSec && durationSec > 0 && track.fileSizeBytes > 0) {
    const average = Math.round((track.fileSizeBytes * 8) / durationSec / 1000);
    push(facts, "Average bitrate", `${average} kbps`);
  }

  push(facts, "Cover art", artwork.bytes ? formatBytes(artwork.bytes) : null);
  if (artwork.mime) {
    push(facts, "Cover format", artwork.mime.replace("image/", "").toUpperCase());
  }

  return facts;
}

/** What the file's ID3 tag says, beyond the fields the library already shows. */
export function buildTagFacts(
  track: LocalTrack,
  details: AudioTagDetails,
  bundle: AudioTagBundle,
): Fact[] {
  const facts: Fact[] = [];

  push(facts, "Title", bundle.tags.title ?? track.title);
  push(facts, "Artist", bundle.tags.artist ?? track.author);
  push(facts, "Album artist", details.albumArtist);
  push(facts, "Album", bundle.tags.album ?? track.album);
  push(facts, "Genre", details.genre);
  push(facts, "Composer", details.composer);
  push(facts, "Conductor", details.conductor);
  push(facts, "Original artist", details.originalArtist);
  push(facts, "Publisher", details.publisher);

  const year = bundle.tags.year ?? track.year;
  push(facts, "Year", year ? String(year) : null);
  const disc = track.discNumber;
  const position = track.trackNumber;
  push(facts, "Track", position ? (disc ? `${disc}.${position}` : String(position)) : null);

  // Audiobooks carry the chapter in the movement pair rather than in the title.
  push(facts, "Chapter", bundle.tags.movement);
  pushNumber(facts, "Chapter number", bundle.tags.movementNumber);

  push(facts, "Grouping", details.grouping);
  push(facts, "Subtitle", details.subtitle);
  push(facts, "BPM", details.bpm ? String(details.bpm) : null);
  push(facts, "Key", details.musicalKey);
  push(facts, "Mood", details.mood);
  push(facts, "Media type", details.mediaType);
  push(facts, "Language", details.language);
  push(facts, "ISRC", details.isrc);
  push(facts, "Copyright", details.copyright);
  push(facts, "Encoded by", details.encodedBy);
  push(facts, "Encoder settings", details.encodingSettings);
  push(facts, "Comment", details.comment);

  if (details.lyrics) {
    const lines = details.lyrics.split("\n").filter((line) => line.trim().length > 0);
    push(facts, "Lyrics", `${lines.length} line${lines.length === 1 ? "" : "s"}`);
  }

  // The tag's own structure, which is the only part of this section that exists
  // for the file rather than for the music.
  push(facts, "Tag", bundle.tagVersion);
  pushNumber(facts, "Tag frames", bundle.frameCount);

  return facts;
}

/** Where the audio actually lives and how the library got it. */
export function buildFileFacts(track: LocalTrack): Fact[] {
  const facts: Fact[] = [];

  push(facts, "File name", track.fileName);
  push(facts, "Folder", track.folderName ?? track.folderKey);
  push(facts, "Size", track.fileSizeBytes > 0 ? formatBytes(track.fileSizeBytes) : null);
  push(facts, "Type", track.mimeType);
  push(facts, "Source", describeTrackSource(track.source));
  push(facts, "Availability", describeAvailability(track.availability));
  push(facts, "Location", track.fileUri ?? track.sourceUri, true);
  push(facts, "Modified", formatDateTime(track.sourceMtime));
  push(facts, "Added to library", formatDateTime(track.createdAt));
  push(facts, "Last updated", formatDateTime(track.updatedAt));
  push(facts, "Sync", describeSyncStatus(track.syncStatus));
  push(facts, "Content hash", track.contentHash, true);

  return facts;
}

export type TrackFactInput = {
  track: LocalTrack;
  stats: TrackStats;
  summary: SessionSummary;
  info: AudioInfo;
  details: AudioTagDetails;
  tag: AudioTagBundle;
  artworkBytes: number | null;
  artworkMime: string | null;
};

/**
 * The whole panel, in reading order: what you did with it, what it is, what it
 * claims to be, and where it came from. Sections with nothing in them are
 * dropped rather than rendered empty.
 */
export function buildTrackFactSections(input: TrackFactInput): FactSection[] {
  const sections: FactSection[] = [
    { title: "PLAYBACK", facts: buildPlaybackFacts(input.track, input.stats, input.summary) },
    {
      title: "AUDIO",
      facts: buildAudioFacts(input.track, input.info, {
        bytes: input.artworkBytes,
        mime: input.artworkMime,
      }),
    },
    { title: "TAGS", facts: buildTagFacts(input.track, input.details, input.tag) },
    { title: "FILE", facts: buildFileFacts(input.track) },
  ];

  return sections.filter((section) => section.facts.length > 0);
}
