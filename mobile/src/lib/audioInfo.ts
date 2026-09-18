/**
 * What the audio stream itself declares, read from the bytes.
 *
 * Everything here is a fact the file states about itself — no estimates from
 * file size, no guesses from the extension. A caller that wants "average
 * bitrate" can divide size by duration; that is a different number from the one
 * a stream declares and the two must not be confused.
 *
 * Pure and dependency-free, like `audioTags`: the caller supplies a bounded
 * window of the file and the absolute offset it was read from, and gets back a
 * flat record of nullable fields. `null` means "the file did not say", which is
 * a different claim from "zero" and is rendered differently.
 */

import {
  childAtoms,
  findChild,
  matchesAscii,
  readAscii,
  readUint16BE,
  readUint16LE,
  readUint32BE,
  readUint32LE,
  scanForMoov,
  type Atom,
} from "@/lib/mediaBytes";

export type AudioInfo = {
  /** Container as it should be shown: `MP3`, `M4B`, `FLAC`, `WAV`, `Ogg`. */
  container: string | null;
  /** The compression format: `MPEG-1 Layer III`, `AAC`, `FLAC`, `PCM`. */
  codec: string | null;
  /** Bitrate the stream declares, in kbps. Null for containers that omit it. */
  bitrateKbps: number | null;
  /** True when the stream is variable-bitrate. */
  variableBitrate: boolean;
  sampleRateHz: number | null;
  channels: number | null;
  /** `Stereo`, `Joint stereo`, `Mono`, `Dual channel`. */
  channelMode: string | null;
  bitsPerSample: number | null;
  /**
   * Duration the stream declares — an MPEG frame count, FLAC total samples, a
   * WAV byte rate, an MP4 movie header. Null when the format cannot state one
   * from its header alone (a VBR MP3 with no Xing frame, an Ogg stream).
   */
  durationSec: number | null;
};

export const EMPTY_AUDIO_INFO: AudioInfo = {
  container: null,
  codec: null,
  bitrateKbps: null,
  variableBitrate: false,
  sampleRateHz: null,
  channels: null,
  channelMode: null,
  bitsPerSample: null,
  durationSec: null,
};

export type ParseAudioInfoOptions = {
  /** Used only to label the container when the bytes do not name it. */
  fileName: string;
  fileSizeBytes: number;
  /** Absolute file offset of `bytes[0]`. Lets a caller read a tail window. */
  byteOffset?: number;
};

function channelLabel(channels: number | null): string | null {
  if (channels === null) {
    return null;
  }
  if (channels === 1) {
    return "Mono";
  }
  if (channels === 2) {
    return "Stereo";
  }
  return `${channels} channels`;
}

// --- MPEG audio (MP3 / MP2) ----------------------------------------------

const MPEG_BITRATES: Record<string, readonly number[]> = {
  // `version-layer`, where version 1 is MPEG-1 and 2 covers MPEG-2 and 2.5.
  "1-1": [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448],
  "1-2": [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384],
  "1-3": [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
  "2-1": [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256],
  "2-2": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
  "2-3": [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160],
};

const MPEG_SAMPLE_RATES: Record<number, readonly number[]> = {
  1: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  2.5: [11025, 12000, 8000],
};

const CHANNEL_MODES = ["Stereo", "Joint stereo", "Dual channel", "Mono"] as const;

type MpegFrame = {
  /** 1, 2, or 2.5. */
  version: number;
  /** 1, 2, or 3. */
  layer: number;
  bitrateKbps: number;
  sampleRateHz: number;
  channelMode: string;
  channels: number;
  /** Total frame length in bytes, including the header. */
  frameLength: number;
  /** Samples one frame carries — the unit Xing's frame count is expressed in. */
  samplesPerFrame: number;
  /** Bytes between the header and a Xing tag. */
  sideInfoBytes: number;
  /** Offset of the frame within the supplied window. */
  offset: number;
};

function parseMpegFrame(bytes: Uint8Array, offset: number): MpegFrame | null {
  if (offset + 4 > bytes.length) {
    return null;
  }
  const header = readUint32BE(bytes, offset);
  if ((header & 0xffe00000) !== 0xffe00000) {
    return null;
  }

  const versionBits = (header >>> 19) & 0x3;
  const layerBits = (header >>> 17) & 0x3;
  const bitrateIndex = (header >>> 12) & 0xf;
  const sampleRateIndex = (header >>> 10) & 0x3;
  const padding = (header >>> 9) & 0x1;
  const channelModeIndex = (header >>> 6) & 0x3;

  if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 0xf) {
    return null;
  }
  if (sampleRateIndex === 3) {
    return null;
  }

  const version = versionBits === 3 ? 1 : versionBits === 2 ? 2 : 2.5;
  const layer = 4 - layerBits;
  const bitrateTable = MPEG_BITRATES[`${version === 1 ? 1 : 2}-${layer}`];
  const sampleRate = MPEG_SAMPLE_RATES[version]?.[sampleRateIndex];
  const bitrateKbps = bitrateTable?.[bitrateIndex];
  if (!bitrateTable || !sampleRate || !bitrateKbps) {
    return null;
  }

  const mono = channelModeIndex === 3;
  // Layer III carries side information between the header and a Xing tag; its
  // size depends on both the version and the channel count.
  const sideInfoBytes = layer === 3 ? (version === 1 ? (mono ? 17 : 32) : mono ? 9 : 17) : 0;
  const samplesPerFrame = layer === 1 ? 384 : layer === 3 && version !== 1 ? 576 : 1152;
  const frameLength =
    layer === 1
      ? Math.floor((12 * bitrateKbps * 1000) / sampleRate + padding) * 4
      : Math.floor(((samplesPerFrame / 8) * bitrateKbps * 1000) / sampleRate + padding);

  if (frameLength <= 4) {
    return null;
  }

  return {
    version,
    layer,
    bitrateKbps,
    sampleRateHz: sampleRate,
    channelMode: CHANNEL_MODES[channelModeIndex] ?? "Stereo",
    channels: mono ? 1 : 2,
    frameLength,
    samplesPerFrame,
    sideInfoBytes,
    offset,
  };
}

/** Roman numeral for the layer, as every player displays it. */
function layerLabel(layer: number): string {
  return layer === 1 ? "I" : layer === 2 ? "II" : "III";
}

/** The VBR header a LAME or Fraunhofer encoder writes into the first frame. */
function readVbrHeader(
  bytes: Uint8Array,
  frame: MpegFrame,
): { frames: number | null; bytes: number | null; tag: "Xing" | "Info" | "VBRI" } | null {
  const xingAt = frame.offset + 4 + frame.sideInfoBytes;
  if (matchesAscii(bytes, xingAt, "Xing") || matchesAscii(bytes, xingAt, "Info")) {
    const tag = readAscii(bytes, xingAt, 4) as "Xing" | "Info";
    const flags = readUint32BE(bytes, xingAt + 4);
    let cursor = xingAt + 8;
    let frames: number | null = null;
    let byteCount: number | null = null;
    if ((flags & 0x1) !== 0) {
      frames = readUint32BE(bytes, cursor);
      cursor += 4;
    }
    if ((flags & 0x2) !== 0) {
      byteCount = readUint32BE(bytes, cursor);
    }
    return { frames, bytes: byteCount, tag };
  }

  // VBRI is always 32 bytes past the header, regardless of version or channels.
  const vbriAt = frame.offset + 36;
  if (matchesAscii(bytes, vbriAt, "VBRI")) {
    return {
      bytes: readUint32BE(bytes, vbriAt + 10),
      frames: readUint32BE(bytes, vbriAt + 14),
      tag: "VBRI",
    };
  }

  return null;
}

function parseMpeg(
  bytes: Uint8Array,
  start: number,
  options: ParseAudioInfoOptions,
): AudioInfo | null {
  // Scan for the first frame sync. The window is small, and a false positive is
  // rejected by `parseMpegFrame`'s reserved-bit checks, so a byte walk is both
  // simpler and more forgiving than trusting the tag size to be exact.
  let offset = start;
  let frame: MpegFrame | null = null;
  while (offset + 4 <= bytes.length) {
    const candidate = parseMpegFrame(bytes, offset);
    if (candidate) {
      frame = candidate;
      break;
    }
    offset += 1;
  }
  if (!frame) {
    return null;
  }

  const vbr = readVbrHeader(bytes, frame);
  const versionLabel = frame.version === 1 ? "1" : frame.version === 2 ? "2" : "2.5";
  const info: AudioInfo = {
    ...EMPTY_AUDIO_INFO,
    container: frame.version === 1 ? "MP3" : "MP3 (MPEG-2)",
    codec: `MPEG-${versionLabel} Layer ${layerLabel(frame.layer)}`,
    sampleRateHz: frame.sampleRateHz,
    channels: frame.channels,
    channelMode: frame.channelMode,
    bitrateKbps: frame.bitrateKbps,
  };

  if (vbr?.frames) {
    const durationSec = (vbr.frames * frame.samplesPerFrame) / frame.sampleRateHz;
    // "Xing" and "VBRI" both mean the encoder varied the bitrate; "Info" is
    // LAME's marker for a constant stream, carrying the same counters.
    info.variableBitrate = vbr.tag !== "Info";
    info.durationSec = durationSec;
    if (vbr.bytes) {
      // The header records the stream's byte count, which turns the frame count
      // into a true average bitrate — the number a listener actually sees.
      info.bitrateKbps = Math.round((vbr.bytes * 8) / durationSec / 1000);
    }
  } else {
    // No VBR header. Two frames with different bitrates settle the question;
    // otherwise the stream is constant and its duration is exactly computable.
    const next = parseMpegFrame(bytes, frame.offset + frame.frameLength);
    if (next && next.bitrateKbps !== frame.bitrateKbps) {
      info.variableBitrate = true;
    } else {
      const audioBytes = options.fileSizeBytes - (options.byteOffset ?? 0) - frame.offset;
      if (audioBytes > 0) {
        info.durationSec = (audioBytes * 8) / (frame.bitrateKbps * 1000);
      }
    }
  }

  return info;
}

// --- FLAC -----------------------------------------------------------------

/** FLAC's PICTURE block type, shared with the artwork reader. */
export const FLAC_PICTURE_BLOCK = 6;

/**
 * Walks FLAC's metadata block headers, which sit immediately after the `fLaC`
 * marker. Exported because the picture block is parsed elsewhere and must walk
 * exactly the same chain — two copies would drift on the last-block flag.
 */
export function flacMetadataBlocks(
  bytes: Uint8Array,
): { type: number; start: number; length: number }[] {
  const blocks: { type: number; start: number; length: number }[] = [];
  if (!matchesAscii(bytes, 0, "fLaC")) {
    return blocks;
  }
  let offset = 4;
  while (offset + 4 <= bytes.length) {
    const header = bytes[offset];
    const length = (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
    blocks.push({ type: header & 0x7f, start: offset + 4, length });
    if ((header & 0x80) !== 0) {
      break;
    }
    offset += 4 + length;
  }
  return blocks;
}

function parseFlac(bytes: Uint8Array): AudioInfo | null {
  const streamInfo = flacMetadataBlocks(bytes).find((block) => block.type === 0);
  if (!streamInfo || streamInfo.length < 34) {
    return null;
  }

  // STREAMINFO packs four fields into the eight bytes at +10, MSB first:
  // sampleRate(20) channels-1(3) bitsPerSample-1(5) totalSamples(36).
  //
  // Byte by byte, from `packed`:
  //   +0  sample rate, bits 0–7
  //   +1  sample rate, bits 8–15
  //   +2  sample rate bits 16–19 | channels-1 (bits 20–22) | bit depth bit 23
  //   +3  bit depth bits 24–27   | total samples bits 28–31
  //   +4… total samples, bits 32–63
  //
  // Only the sample rate is byte-aligned enough to read as a whole; the other
  // three have to be assembled from bit fields, which is why they are read from
  // `packed + 2` and `packed + 3` rather than from the end of the sample-rate
  // word.
  const packed = streamInfo.start + 10;
  const sampleRateHz = readUint32BE(bytes, packed) >>> 12;
  const channels = ((bytes[packed + 2] >>> 1) & 0x7) + 1;
  const bitsPerSample = (((bytes[packed + 2] & 0x1) << 4) | (bytes[packed + 3] >>> 4)) + 1;
  const totalSamples = (bytes[packed + 3] & 0x0f) * 0x100000000 + readUint32BE(bytes, packed + 4);

  return {
    ...EMPTY_AUDIO_INFO,
    container: "FLAC",
    codec: "FLAC",
    sampleRateHz,
    channels,
    channelMode: channelLabel(channels),
    bitsPerSample,
    durationSec: sampleRateHz > 0 ? totalSamples / sampleRateHz : null,
  };
}

// --- WAV ------------------------------------------------------------------

const WAVE_FORMATS: Record<number, string> = {
  0x0001: "PCM",
  0x0003: "IEEE float",
  0x0006: "A-law",
  0x0007: "µ-law",
  0xfffe: "PCM (extensible)",
};

function parseWav(bytes: Uint8Array): AudioInfo | null {
  if (!matchesAscii(bytes, 0, "RIFF") || !matchesAscii(bytes, 8, "WAVE")) {
    return null;
  }

  let offset = 12;
  let format: number | null = null;
  let channels: number | null = null;
  let sampleRateHz: number | null = null;
  let byteRate: number | null = null;
  let bitsPerSample: number | null = null;
  let dataBytes: number | null = null;

  while (offset + 8 <= bytes.length) {
    const id = readAscii(bytes, offset, 4);
    const size = readUint32LE(bytes, offset + 4);
    const body = offset + 8;
    if (id === "fmt " && body + 16 <= bytes.length) {
      format = readUint16LE(bytes, body);
      channels = readUint16LE(bytes, body + 2);
      sampleRateHz = readUint32LE(bytes, body + 4);
      byteRate = readUint32LE(bytes, body + 8);
      bitsPerSample = readUint16LE(bytes, body + 14);
    } else if (id === "data") {
      dataBytes = size;
      break;
    }
    // Chunks are word-aligned: an odd size is followed by one pad byte.
    offset = body + size + (size % 2);
  }

  if (sampleRateHz === null || channels === null) {
    return null;
  }

  return {
    ...EMPTY_AUDIO_INFO,
    container: "WAV",
    codec: format === null ? null : (WAVE_FORMATS[format] ?? `Format 0x${format.toString(16)}`),
    sampleRateHz,
    channels,
    channelMode: channelLabel(channels),
    bitsPerSample,
    // A PCM bitrate is derivable exactly, unlike the container formats'.
    bitrateKbps: byteRate ? Math.round((byteRate * 8) / 1000) : null,
    durationSec: dataBytes !== null && byteRate ? dataBytes / byteRate : null,
  };
}

// --- Ogg ------------------------------------------------------------------

function parseOgg(bytes: Uint8Array): AudioInfo | null {
  if (!matchesAscii(bytes, 0, "OggS")) {
    return null;
  }
  // The first packet begins after the page header and its segment table. The
  // header is 27 bytes (capture pattern 4, version 1, flags 1, granule 8,
  // serial 4, sequence 4, CRC 4) and `page_segments` is its last byte at index
  // 26 — so the table runs from 27 and the packet starts 27 + page_segments in.
  const packetStart = 27 + (bytes[26] ?? 0);
  if (packetStart >= bytes.length) {
    return null;
  }

  // Vorbis identification header: type(1) "vorbis"(6) version(4) channels(1)
  // sampleRate(4) bitrateMax(4) bitrateNominal(4) bitrateMin(4).
  if (matchesAscii(bytes, packetStart + 1, "vorbis")) {
    const channels = bytes[packetStart + 11] ?? null;
    const sampleRateHz = readUint32LE(bytes, packetStart + 12);
    const nominal = readUint32LE(bytes, packetStart + 20);
    return {
      ...EMPTY_AUDIO_INFO,
      container: "Ogg",
      codec: "Vorbis",
      sampleRateHz: sampleRateHz > 0 ? sampleRateHz : null,
      channels,
      channelMode: channelLabel(channels),
      bitrateKbps: nominal > 0 ? Math.round(nominal / 1000) : null,
      variableBitrate: true,
    };
  }

  // OpusHead: "OpusHead"(8) version(1) channels(1) preSkip(2) inputRate(4).
  if (matchesAscii(bytes, packetStart, "OpusHead")) {
    const channels = bytes[packetStart + 9] ?? null;
    const inputSampleRate = readUint32LE(bytes, packetStart + 12);
    return {
      ...EMPTY_AUDIO_INFO,
      container: "Ogg",
      codec: "Opus",
      // Opus always decodes at 48 kHz; the header's rate is the source rate.
      sampleRateHz: inputSampleRate > 0 ? inputSampleRate : 48000,
      channels,
      channelMode: channelLabel(channels),
      variableBitrate: true,
    };
  }

  if (matchesAscii(bytes, packetStart, "\u007fFLAC")) {
    return { ...EMPTY_AUDIO_INFO, container: "Ogg", codec: "FLAC" };
  }

  return { ...EMPTY_AUDIO_INFO, container: "Ogg" };
}

// --- MP4 / M4A / M4B ------------------------------------------------------

const MP4_BRANDS: Record<string, string> = {
  M4A: "M4A",
  M4B: "M4B",
  M4P: "M4P",
  mp42: "MP4",
  mp41: "MP4",
  isom: "MP4",
  iso2: "MP4",
  dash: "MP4",
  "3gp4": "3GP",
  "3gp5": "3GP",
  qt: "QuickTime",
};

const MP4_CODECS: Record<string, string> = {
  mp4a: "AAC",
  alac: "ALAC",
  "ac-3": "AC-3",
  "ec-3": "E-AC-3",
  "ac-4": "AC-4",
  fLaC: "FLAC",
  Opus: "Opus",
  samr: "AMR-NB",
  sawb: "AMR-WB",
  twos: "PCM (signed)",
  sowt: "PCM (little-endian)",
  lpcm: "PCM",
  alaw: "A-law",
  ulaw: "µ-law",
};

/**
 * `stsd` holds the audio sample entry, whose fixed fields are the only place an
 * MP4 states its channel count, sample size and sample rate.
 */
function readSampleEntry(
  bytes: Uint8Array,
  stsd: Atom,
): {
  format: string;
  channels: number | null;
  bitsPerSample: number | null;
  sampleRateHz: number | null;
} | null {
  // `stsd` is version/flags(4) then entryCount(4) before the first entry.
  const body = stsd.start + stsd.headerBytes + 8;
  const size = readUint32BE(bytes, body);
  if (size < 36 || body + 36 > bytes.length) {
    return null;
  }
  const channels = readUint16BE(bytes, body + 24);
  const bitsPerSample = readUint16BE(bytes, body + 26);
  // The rate is 16.16 fixed point, and any fractional part is noise.
  const sampleRateHz = readUint16BE(bytes, body + 32);
  return {
    format: readAscii(bytes, body + 4, 4),
    channels: channels > 0 ? channels : null,
    bitsPerSample: bitsPerSample > 0 ? bitsPerSample : null,
    sampleRateHz: sampleRateHz > 0 ? sampleRateHz : null,
  };
}

function parseMp4(moov: Atom | null, bytes: Uint8Array, majorBrand: string | null): AudioInfo {
  const info: AudioInfo = {
    ...EMPTY_AUDIO_INFO,
    container: majorBrand ? (MP4_BRANDS[majorBrand] ?? majorBrand.trim()) : "MP4",
  };
  if (!moov) {
    // The brand is still worth having even when the movie header was missed.
    return info;
  }

  const mvhd = findChild(bytes, moov, "mvhd");
  if (mvhd) {
    const body = mvhd.start + mvhd.headerBytes;
    const version = bytes[body] ?? 0;
    // v0: creation(4) modification(4) timescale(4) duration(4)
    // v1: creation(8) modification(8) timescale(4) duration(8)
    const timescale = readUint32BE(bytes, body + (version === 1 ? 20 : 12));
    const duration =
      version === 1
        ? readUint32BE(bytes, body + 24) * 0x100000000 + readUint32BE(bytes, body + 28)
        : readUint32BE(bytes, body + 16);
    if (timescale > 0 && duration > 0) {
      info.durationSec = duration / timescale;
    }
  }

  for (const trak of childAtoms(bytes, moov.start + moov.headerBytes, moov.end)) {
    if (trak.type !== "trak") {
      continue;
    }
    const mdia = findChild(bytes, trak, "mdia");
    if (!mdia) {
      continue;
    }
    const hdlr = findChild(bytes, mdia, "hdlr");
    // Skip video and metadata tracks: this is an audio player.
    if (hdlr && readAscii(bytes, hdlr.start + hdlr.headerBytes + 8, 4) !== "soun") {
      continue;
    }
    const minf = findChild(bytes, mdia, "minf");
    const stbl = minf ? findChild(bytes, minf, "stbl") : null;
    const stsd = stbl ? findChild(bytes, stbl, "stsd") : null;
    if (!stsd) {
      continue;
    }
    const entry = readSampleEntry(bytes, stsd);
    if (!entry) {
      continue;
    }
    info.codec = MP4_CODECS[entry.format] ?? entry.format.trim();
    info.channels = entry.channels;
    info.channelMode = channelLabel(entry.channels);
    info.bitsPerSample = entry.bitsPerSample;
    info.sampleRateHz = entry.sampleRateHz;
    break;
  }

  return info;
}

// --- Dispatch -------------------------------------------------------------

/** True when the four bytes at offset 4 name a top-level MP4 box. */
function looksLikeMp4(bytes: Uint8Array): boolean {
  return (
    matchesAscii(bytes, 4, "ftyp") ||
    matchesAscii(bytes, 4, "moov") ||
    matchesAscii(bytes, 4, "free") ||
    matchesAscii(bytes, 4, "mdat")
  );
}

/**
 * Reads what the stream declares. Returns `EMPTY_AUDIO_INFO` for a container
 * this reader does not know rather than guessing from the extension: a wrong
 * bitrate on a details panel is worse than an absent one.
 *
 * `byteOffset` matters for two callers: an MP4 whose `moov` sits at the end of
 * the file is found by re-reading a tail window, and an MP3 whose ID3 tag
 * overflows the head window is found by re-reading past the tag.
 */
export function parseAudioInfo(bytes: Uint8Array, options: ParseAudioInfoOptions): AudioInfo {
  if (bytes.length === 0) {
    return EMPTY_AUDIO_INFO;
  }

  const base = options.byteOffset ?? 0;

  // A window that does not start at the file's beginning can only be an MP4
  // tail looking for its movie header.
  if (base > 0) {
    return parseMp4(scanForMoov(bytes, options.fileSizeBytes, base), bytes, null);
  }

  if (matchesAscii(bytes, 0, "fLaC")) {
    return parseFlac(bytes) ?? EMPTY_AUDIO_INFO;
  }
  if (matchesAscii(bytes, 0, "RIFF") && matchesAscii(bytes, 8, "WAVE")) {
    return parseWav(bytes) ?? EMPTY_AUDIO_INFO;
  }
  if (matchesAscii(bytes, 0, "OggS")) {
    return parseOgg(bytes) ?? EMPTY_AUDIO_INFO;
  }
  // `ftyp` is a stronger signature than an MPEG frame sync, so it is checked
  // first: an M4A's `ftyp` payload can contain bytes that look like one.
  if (looksLikeMp4(bytes)) {
    const top = childAtoms(bytes, 0, bytes.length);
    const ftyp = top.find((atom) => atom.type === "ftyp");
    return parseMp4(
      top.find((atom) => atom.type === "moov") ?? null,
      bytes,
      ftyp ? readAscii(bytes, ftyp.start + ftyp.headerBytes, 4) : null,
    );
  }

  // An ID3v2 tag at the head is not audio; skip it before looking for a frame.
  let start = 0;
  if (matchesAscii(bytes, 0, "ID3")) {
    start =
      10 +
      (((bytes[6] & 0x7f) << 21) |
        ((bytes[7] & 0x7f) << 14) |
        ((bytes[8] & 0x7f) << 7) |
        (bytes[9] & 0x7f));
  }
  if (start < bytes.length) {
    const mpeg = parseMpeg(bytes, start, options);
    if (mpeg) {
      return mpeg;
    }
  }

  return EMPTY_AUDIO_INFO;
}
