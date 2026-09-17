import type { AudioTags } from "@/lib/audioTags";
import { fileExtension } from "@/lib/audioFormats";
import { readFilenameTags, stripExtension } from "@/lib/filenameTags";

/**
 * Decides what a discovered file should be called and how it should be filed.
 *
 * The two metadata sources disagree in a useful way: tags are authoritative when
 * they exist, but a filename frequently carries a track number that the tag does
 * not, and lecture recordings often have no tags at all. So each field is taken
 * from whichever source actually has it rather than picking one source wholesale.
 */

export type ResolvedTrackMetadata = {
  title: string;
  author: string | null;
  album: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  isAudiobook: boolean;
};

/** Past this length, treating a file as long-form rather than music is a safe bet. */
const AUDIOBOOK_MIN_SEC = 30 * 60;

export function resolveTrackMetadata(input: {
  fileName: string;
  durationSec: number;
  tags: AudioTags;
}): ResolvedTrackMetadata {
  const fromName = readFilenameTags(input.fileName);
  const fallbackTitle = stripExtension(input.fileName).trim() || input.fileName;

  return {
    title: input.tags.title ?? fromName.title ?? fallbackTitle,
    author: input.tags.artist,
    album: input.tags.album,
    trackNumber: input.tags.trackNumber ?? fromName.trackNumber,
    discNumber: input.tags.discNumber,
    year: input.tags.year ?? fromName.year,
    // `.m4b` is the audiobook container specifically; length covers the rest,
    // including the folder-scan case where the duration is not yet known.
    isAudiobook: fileExtension(input.fileName) === "m4b" || input.durationSec >= AUDIOBOOK_MIN_SEC,
  };
}
