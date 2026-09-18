import { readAsStringAsync } from "expo-file-system/legacy";

import {
  EMPTY_AUDIO_INFO,
  parseAudioInfo,
  type AudioInfo,
} from "@/lib/audioInfo";
import {
  EMPTY_AUDIO_TAG_BUNDLE,
  readAudioTagBundle,
  readId3TagSize,
  type AudioTagBundle,
  type EmbeddedPicture,
} from "@/lib/audioTags";
import { decodeBase64 } from "@/lib/base64";
import { readEmbeddedArtwork } from "@/lib/embeddedArtwork";
import { matchesAscii } from "@/lib/mediaBytes";

/**
 * Reads a bounded window of an audio file and answers everything the bytes can
 * be asked: the tag, the stream parameters, and whether a cover picture is in
 * there.
 *
 * This is the only place that decides *how much* to read, and it reads as
 * little as it can:
 *
 * - one 512 KB window covers the ID3 tag, FLAC's metadata blocks, a WAV header,
 *   an Ogg page and the first MPEG frames — i.e. almost every real file;
 * - a second, larger window only when the tag declares itself bigger than the
 *   first, which happens exactly when a large picture is embedded;
 * - a tail window only for MP4, whose `moov` (and therefore its codec, duration
 *   and cover art) normally sits at the *end* of the file.
 *
 * Nothing here writes, caches or decides what to do with a picture — that is
 * `ArtworkService`'s job.
 */

/** Enough for a tag, a FLAC header, a WAV header, an Ogg page, and MPEG frames. */
const HEAD_WINDOW_BYTES = 512 * 1024;
/** A tag bigger than this is not carrying artwork worth importing. */
const MAX_TAG_WINDOW_BYTES = 4 * 1024 * 1024;
/** MP4 movie headers live at the end; this window has to reach them. */
const TAIL_WINDOW_BYTES = 1024 * 1024;

export type AudioInspection = {
  info: AudioInfo;
  tag: AudioTagBundle;
  /**
   * The cover picture's bytes — only when `includeArtwork` was asked for. A
   * details screen wants the picture's *size*, not a 4 MB buffer in state.
   */
  picture: EmbeddedPicture | null;
  artworkBytes: number | null;
  artworkMime: string | null;
};

export const EMPTY_AUDIO_INSPECTION: AudioInspection = {
  info: EMPTY_AUDIO_INFO,
  tag: EMPTY_AUDIO_TAG_BUNDLE,
  picture: null,
  artworkBytes: null,
  artworkMime: null,
};

async function readWindow(uri: string, position: number, length: number): Promise<Uint8Array> {
  if (length <= 0) {
    return new Uint8Array(0);
  }
  const base64 = await readAsStringAsync(uri, { position, length, encoding: "base64" });
  return decodeBase64(base64);
}

/** Fills gaps in `head` from `tail` — used to complete an MP4 read from its end. */
function mergeAudioInfo(head: AudioInfo, tail: AudioInfo): AudioInfo {
  return {
    container: head.container ?? tail.container,
    codec: head.codec ?? tail.codec,
    bitrateKbps: head.bitrateKbps ?? tail.bitrateKbps,
    variableBitrate: head.variableBitrate || tail.variableBitrate,
    sampleRateHz: head.sampleRateHz ?? tail.sampleRateHz,
    channels: head.channels ?? tail.channels,
    channelMode: head.channelMode ?? tail.channelMode,
    bitsPerSample: head.bitsPerSample ?? tail.bitsPerSample,
    durationSec: head.durationSec ?? tail.durationSec,
  };
}

export async function inspectAudioFile(
  uri: string,
  options: {
    fileName: string;
    fileSizeBytes: number;
    /** Keep the picture's bytes in the result. Off by default. */
    includeArtwork?: boolean;
  },
): Promise<AudioInspection> {
  const fileSizeBytes = options.fileSizeBytes > 0 ? options.fileSizeBytes : 0;

  let head = await readWindow(
    uri,
    0,
    fileSizeBytes > 0 ? Math.min(fileSizeBytes, HEAD_WINDOW_BYTES) : HEAD_WINDOW_BYTES,
  );

  // An ID3 tag states its own length, so a tag that overflows the first window
  // can be read exactly rather than guessed at. This is the only reason a
  // second head read ever happens.
  const declaredTag = readId3TagSize(head);
  if (
    declaredTag !== null &&
    10 + declaredTag > head.length &&
    10 + declaredTag <= MAX_TAG_WINDOW_BYTES
  ) {
    const wanted = fileSizeBytes > 0 ? Math.min(fileSizeBytes, 10 + declaredTag) : 10 + declaredTag;
    const bigger = await readWindow(uri, 0, wanted);
    if (bigger.length > head.length) {
      head = bigger;
    }
  }

  const tag = head.length > 0 ? readAudioTagBundle(head) : EMPTY_AUDIO_TAG_BUNDLE;
  let picture = head.length > 0 ? readEmbeddedArtwork(head, { fileSizeBytes }) : null;
  let info = parseAudioInfo(head, { fileName: options.fileName, fileSizeBytes });

  // An MP4 keeps `moov` — codec, duration and cover art alike — at the end of
  // the file unless it was written for streaming, so one tail read completes
  // everything the head window could not see.
  const tailStart = fileSizeBytes - TAIL_WINDOW_BYTES;
  if (matchesAscii(head, 4, "ftyp") && tailStart > 0 && (picture === null || info.codec === null)) {
    const tail = await readWindow(uri, tailStart, TAIL_WINDOW_BYTES);
    if (tail.length > 0) {
      if (picture === null) {
        picture = readEmbeddedArtwork(tail, { byteOffset: tailStart, fileSizeBytes });
      }
      info = mergeAudioInfo(
        info,
        parseAudioInfo(tail, {
          fileName: options.fileName,
          fileSizeBytes,
          byteOffset: tailStart,
        }),
      );
    }
  }

  return {
    info,
    tag,
    picture: options.includeArtwork ? picture : null,
    artworkBytes: picture ? picture.data.length : null,
    artworkMime: picture ? picture.mimeType : null,
  };
}
