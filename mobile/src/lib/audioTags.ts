/**
 * A minimal ID3v2 reader, pure and dependency-free.
 *
 * It exists because the scan already reads the first megabyte of every new file
 * to compute its SHA-256 content hash, and an ID3v2 tag lives at offset 0 of
 * that very same buffer. Parsing it here therefore costs no extra I/O and no
 * extra native module — the alternative (`react-native-get-music-files` or a
 * native tag reader) would mean a second dependency and a second read per file.
 *
 * Two levels of detail, one walk:
 *
 * - `readAudioTags` returns the eight fields importing needs, and nothing else.
 *   Its shape is a contract — it is what `resolveTrackMetadata` consumes.
 * - `readAudioTagBundle` returns everything else the file carries: the extended
 *   text frames, the embedded cover picture, and how the tag is structured.
 *   This is what the track details panel reads.
 *
 * Decoding is hand-rolled rather than delegated to `TextDecoder`, whose
 * availability varies across Hermes builds.
 */

import { resolveGenre } from "@/lib/id3Genres";

export type AudioTags = {
  title: string | null;
  artist: string | null;
  album: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  /** `MVNM` — audiobooks use the movement pair as chapter name/number. */
  movement: string | null;
  movementNumber: number | null;
};

/**
 * Frames that are worth showing but that nothing depends on. Kept separate from
 * `AudioTags` on purpose: an import must never be affected by a field being
 * added here.
 */
export type AudioTagDetails = {
  albumArtist: string | null;
  composer: string | null;
  genre: string | null;
  comment: string | null;
  bpm: number | null;
  grouping: string | null;
  subtitle: string | null;
  originalArtist: string | null;
  conductor: string | null;
  publisher: string | null;
  copyright: string | null;
  encodedBy: string | null;
  encodingSettings: string | null;
  isrc: string | null;
  language: string | null;
  musicalKey: string | null;
  mood: string | null;
  mediaType: string | null;
  /** `USLT`/`ULT` lyrics, verbatim. */
  lyrics: string | null;
};

/** An attached picture frame, decoded but not written anywhere yet. */
export type EmbeddedPicture = {
  /** `image/jpeg`, `image/png`, … — null when the frame did not say. */
  mimeType: string | null;
  /** ID3v2 picture type: 3 is the front cover. */
  pictureType: number | null;
  /** The image bytes exactly as stored in the frame. */
  data: Uint8Array;
};

/** Everything one ID3v2 tag contains. */
export type AudioTagBundle = {
  tags: AudioTags;
  details: AudioTagDetails;
  /** Null when the tag holds no picture, or when it did not fit in the buffer. */
  picture: EmbeddedPicture | null;
  /** `"ID3v2.3"`, `"ID3v2.4"`, `"ID3v2.2"`, or null when there is no tag. */
  tagVersion: string | null;
  /** Bytes the tag declares for its frames, excluding the 10-byte header. */
  tagSizeBytes: number;
  /**
   * True when the buffer ended before the tag did, so frames near the end were
   * never reached. A caller looking for a picture must not conclude "there is
   * none" from a truncated read — it must read a bigger window first.
   */
  truncated: boolean;
  /** Frames successfully walked. */
  frameCount: number;
};

export const EMPTY_AUDIO_TAGS: AudioTags = {
  title: null,
  artist: null,
  album: null,
  trackNumber: null,
  discNumber: null,
  year: null,
  movement: null,
  movementNumber: null,
};

export const EMPTY_AUDIO_TAG_DETAILS: AudioTagDetails = {
  albumArtist: null,
  composer: null,
  genre: null,
  comment: null,
  bpm: null,
  grouping: null,
  subtitle: null,
  originalArtist: null,
  conductor: null,
  publisher: null,
  copyright: null,
  encodedBy: null,
  encodingSettings: null,
  isrc: null,
  language: null,
  musicalKey: null,
  mood: null,
  mediaType: null,
  lyrics: null,
};

export const EMPTY_AUDIO_TAG_BUNDLE: AudioTagBundle = {
  tags: EMPTY_AUDIO_TAGS,
  details: EMPTY_AUDIO_TAG_DETAILS,
  picture: null,
  tagVersion: null,
  tagSizeBytes: 0,
  truncated: false,
  frameCount: 0,
};

/** Frame id to core field. v2.2 uses three-character ids, v2.3/v2.4 use four. */
const TEXT_FRAMES: Record<string, keyof AudioTags> = {
  TIT2: "title",
  TPE1: "artist",
  TALB: "album",
  TRCK: "trackNumber",
  TPOS: "discNumber",
  TDRC: "year",
  TYER: "year",
  MVNM: "movement",
  MVIN: "movementNumber",
  TT2: "title",
  TP1: "artist",
  TAL: "album",
  TRK: "trackNumber",
  TPA: "discNumber",
  TYE: "year",
};

/** Frame id to extended field. */
const DETAIL_FRAMES: Record<string, keyof AudioTagDetails> = {
  TPE2: "albumArtist",
  TCOM: "composer",
  TCON: "genre",
  TBPM: "bpm",
  TIT1: "grouping",
  TIT3: "subtitle",
  TOPE: "originalArtist",
  TPE3: "conductor",
  TPUB: "publisher",
  TCOP: "copyright",
  TENC: "encodedBy",
  TSSE: "encodingSettings",
  TSRC: "isrc",
  TLAN: "language",
  TKEY: "musicalKey",
  TMOO: "mood",
  TMED: "mediaType",
  TP2: "albumArtist",
  TCM: "composer",
  TCO: "genre",
  TBP: "bpm",
  TT1: "grouping",
  TT3: "subtitle",
  TOA: "originalArtist",
  TP3: "conductor",
  TPB: "publisher",
  TCR: "copyright",
  TEN: "encodedBy",
  TKE: "musicalKey",
};

/** Comment and lyrics frames share a shape but not a frame id across versions. */
const COMMENT_FRAMES = new Set(["COMM", "COM"]);
const LYRICS_FRAMES = new Set(["USLT", "ULT"]);

const NUMERIC_FIELDS: ReadonlySet<keyof AudioTags> = new Set([
  "trackNumber",
  "discNumber",
  "year",
  "movementNumber",
]);

/** Picture bytes beyond this are not artwork, they are a payload. */
export const MAX_PICTURE_BYTES = 4 * 1024 * 1024;

function syncSafeInt(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] & 0x7f) << 21) |
    ((bytes[offset + 1] & 0x7f) << 14) |
    ((bytes[offset + 2] & 0x7f) << 7) |
    (bytes[offset + 3] & 0x7f)
  );
}

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    ((bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]) >>>
    0
  );
}

function uint24(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let out = "";
  for (let index = 0; index < length; index += 1) {
    out += String.fromCharCode(bytes[offset + index]);
  }
  return out;
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = "";
  for (let index = 0; index < bytes.length; index += 1) {
    out += String.fromCharCode(bytes[index]);
  }
  return out;
}

function decodeUtf8(bytes: Uint8Array): string {
  let out = "";
  let index = 0;
  while (index < bytes.length) {
    const first = bytes[index];
    if (first < 0x80) {
      out += String.fromCharCode(first);
      index += 1;
    } else if ((first & 0xe0) === 0xc0 && index + 1 < bytes.length) {
      out += String.fromCharCode(((first & 0x1f) << 6) | (bytes[index + 1] & 0x3f));
      index += 2;
    } else if ((first & 0xf0) === 0xe0 && index + 2 < bytes.length) {
      out += String.fromCharCode(
        ((first & 0x0f) << 12) | ((bytes[index + 1] & 0x3f) << 6) | (bytes[index + 2] & 0x3f),
      );
      index += 3;
    } else if ((first & 0xf8) === 0xf0 && index + 3 < bytes.length) {
      const codePoint =
        ((first & 0x07) << 18) |
        ((bytes[index + 1] & 0x3f) << 12) |
        ((bytes[index + 2] & 0x3f) << 6) |
        (bytes[index + 3] & 0x3f);
      const offset = codePoint - 0x10000;
      out += String.fromCharCode(0xd800 + (offset >> 10), 0xdc00 + (offset & 0x3ff));
      index += 4;
    } else {
      // Malformed lead byte: skip it rather than throwing away the frame.
      index += 1;
    }
  }
  return out;
}

/**
 * `bomAware` distinguishes encoding 1 (UTF-16 with a byte-order mark) from
 * encoding 2 (UTF-16BE, which by definition carries none). Encoders that omit
 * the BOM on encoding 1 almost always mean little-endian, which is what we
 * assume in that case.
 */
function decodeUtf16(bytes: Uint8Array, bomAware: boolean): string {
  let start = 0;
  let littleEndian = false;
  if (bomAware && bytes.length >= 2) {
    if (bytes[0] === 0xff && bytes[1] === 0xfe) {
      littleEndian = true;
      start = 2;
    } else if (bytes[0] === 0xfe && bytes[1] === 0xff) {
      littleEndian = false;
      start = 2;
    } else {
      littleEndian = true;
    }
  }

  let out = "";
  for (let index = start; index + 1 < bytes.length; index += 2) {
    out += String.fromCharCode(
      littleEndian ? bytes[index] | (bytes[index + 1] << 8) : (bytes[index] << 8) | bytes[index + 1],
    );
  }
  return out;
}

/** How wide one code unit is for an ID3v2 text-encoding byte. */
function encodingWidth(encoding: number): 1 | 2 {
  return encoding === 1 || encoding === 2 ? 2 : 1;
}

function decodeWithEncoding(bytes: Uint8Array, encoding: number): string {
  switch (encoding) {
    case 0:
      return decodeLatin1(bytes);
    case 1:
      return decodeUtf16(bytes, true);
    case 2:
      return decodeUtf16(bytes, false);
    case 3:
      return decodeUtf8(bytes);
    default:
      return "";
  }
}

/**
 * Reads a null-terminated string, honouring the frame's encoding so a UTF-16
 * terminator (`00 00`) is not mistaken for a Latin-1 one.
 */
function readTerminated(
  bytes: Uint8Array,
  offset: number,
  encoding: number,
): { text: string; next: number } {
  const width = encodingWidth(encoding);
  let end = offset;
  while (end + width <= bytes.length) {
    if (width === 1 ? bytes[end] === 0 : bytes[end] === 0 && bytes[end + 1] === 0) {
      break;
    }
    end += width;
  }
  return { text: decodeWithEncoding(bytes.subarray(offset, end), encoding), next: end + width };
}

/** Text frames are null-separated when they carry multiple values. */
function firstValue(text: string): string | null {
  const value = text.split("\u0000")[0]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function decodeTextFrame(body: Uint8Array): string | null {
  if (body.length < 1) {
    return null;
  }
  return firstValue(decodeWithEncoding(body.subarray(1), body[0]));
}

/**
 * `COMM`/`USLT` are `encoding | language(3) | description | text`. The
 * description is usually empty, but it is what separates a real comment from a
 * player's bookkeeping, so it is skipped rather than assumed away.
 */
function decodeDescribedFrame(body: Uint8Array): { text: string | null; language: string | null } {
  if (body.length < 4) {
    return { text: null, language: null };
  }
  const encoding = body[0];
  const language = decodeLatin1(body.subarray(1, 4)).replace(/\u0000/g, "").trim();
  const { next } = readTerminated(body, 4, encoding);
  const text = decodeWithEncoding(body.subarray(Math.min(next, body.length)), encoding).trim();
  return {
    text: text.length > 0 ? text : null,
    language: language.length > 0 ? language : null,
  };
}

const MIME_BY_FORMAT: Record<string, string> = {
  JPG: "image/jpeg",
  JPEG: "image/jpeg",
  PNG: "image/png",
  GIF: "image/gif",
  BMP: "image/bmp",
  WEBP: "image/webp",
  TIFF: "image/tiff",
};

/**
 * `APIC` (v2.3/v2.4) is `encoding | mime | type | description | data`; `PIC`
 * (v2.2) replaces the MIME string with a three-character format code. The
 * description is the reason this cannot be a fixed offset.
 */
function decodePictureFrame(body: Uint8Array, isV22: boolean): EmbeddedPicture | null {
  if (body.length < 5) {
    return null;
  }
  const encoding = body[0];

  let mimeType: string | null = null;
  let cursor: number;
  if (isV22) {
    const code = decodeLatin1(body.subarray(1, 4)).trim().toUpperCase();
    mimeType = MIME_BY_FORMAT[code] ?? (code.length === 3 ? `image/${code.toLowerCase()}` : null);
    cursor = 4;
  } else {
    const { text, next } = readTerminated(body, 1, 0);
    // `-->` means the "picture" is a URL to fetch, not image bytes. Importing it
    // would mean a network call during a scan, and the file would break offline.
    if (text.trim() === "-->") {
      return null;
    }
    mimeType = text.trim().length > 0 ? text.trim().toLowerCase() : null;
    cursor = next;
  }

  if (cursor >= body.length) {
    return null;
  }
  const pictureType = body[cursor];
  cursor += 1;

  const { next } = readTerminated(body, cursor, encoding);
  const start = Math.min(next, body.length);
  const data = body.subarray(start);
  if (data.length === 0 || data.length > MAX_PICTURE_BYTES) {
    return null;
  }

  // Some taggers write a generic or wrong MIME; the magic bytes are the truth.
  return { mimeType: sniffImageMime(data) ?? mimeType, pictureType, data };
}

/** The image format as the bytes themselves declare it. */
export function sniffImageMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return "image/png";
  }
  if (bytes.length >= 6 && ascii(bytes, 0, 3) === "GIF") {
    return "image/gif";
  }
  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return "image/bmp";
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP") {
    return "image/webp";
  }
  return null;
}

/** `TRCK`/`TPOS`/`MVIN` are `n` or `n/total`; only `n` is meaningful here. */
function leadingInteger(value: string): number | null {
  const match = /^(\d{1,4})/.exec(value.trim());
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

/** `TDRC` is a full timestamp (`2024-03-12T10:00`); `TYER` is a bare year. */
function leadingYear(value: string): number | null {
  const match = /^(\d{4})/.exec(value.trim());
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return parsed >= 1000 && parsed <= 2999 ? parsed : null;
}

/**
 * Removes the `0xFF 0x00` padding an unsynchronised tag inserts. Applied to the
 * whole tag body, which is how v2.2 and v2.3 define the flag. v2.4 moved
 * unsynchronisation to a per-frame flag and is rare in practice, so a v2.4 file
 * that sets both will simply yield fewer tags rather than wrong ones.
 */
function deunsynchronise(bytes: Uint8Array): Uint8Array {
  const out = new Uint8Array(bytes.length);
  let written = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    out[written] = bytes[index];
    written += 1;
    if (bytes[index] === 0xff && bytes[index + 1] === 0x00) {
      index += 1;
    }
  }
  return out.subarray(0, written);
}

/**
 * Bytes the ID3v2 tag at offset 0 declares for its frames, excluding the
 * 10-byte header — or null when the buffer does not start with one.
 *
 * This is what lets a caller read exactly the tag and no more, instead of
 * guessing a window and hoping the picture fits inside it.
 */
export function readId3TagSize(bytes: Uint8Array): number | null {
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return null;
  }
  const major = bytes[3];
  if (major < 2 || major > 4) {
    return null;
  }
  return syncSafeInt(bytes, 6);
}

/** True when `bytes` begins with an ID3v2 header this reader can parse. */
export function hasId3Header(bytes: Uint8Array): boolean {
  return readId3TagSize(bytes) !== null;
}

/**
 * Reads the ID3v2 tag at the start of `bytes`, returning everything it holds.
 *
 * A malformed tag must never fail an import — the filename fallback still gives
 * a usable title — so anything unrecognised yields the empty bundle instead of
 * throwing. A picture that does not fit entirely inside `bytes` is reported as
 * absent rather than truncated: half a JPEG renders as a broken tile, and
 * "no artwork" at least renders as the intended gradient.
 */
export function readAudioTagBundle(bytes: Uint8Array): AudioTagBundle {
  const tags: AudioTags = { ...EMPTY_AUDIO_TAGS };
  const details: AudioTagDetails = { ...EMPTY_AUDIO_TAG_DETAILS };
  const bundle: AudioTagBundle = {
    tags,
    details,
    picture: null,
    tagVersion: null,
    tagSizeBytes: 0,
    truncated: false,
    frameCount: 0,
  };

  const declared = readId3TagSize(bytes);
  if (declared === null) {
    return bundle;
  }
  const major = bytes[3];
  bundle.tagVersion = `ID3v2.${major}`;
  bundle.tagSizeBytes = declared;
  bundle.truncated = 10 + declared > bytes.length;

  const flags = bytes[5];
  const tagEnd = Math.min(10 + declared, bytes.length);
  let body = bytes.subarray(10, tagEnd);
  if ((flags & 0x80) !== 0) {
    body = deunsynchronise(body);
  }

  let offset = 0;
  if ((flags & 0x40) !== 0) {
    // Extended header. v2.4's size field counts itself; v2.3's does not.
    if (body.length < 4) {
      return bundle;
    }
    offset = major === 4 ? syncSafeInt(body, 0) : 4 + uint32(body, 0);
  }

  const idLength = major === 2 ? 3 : 4;
  const headerLength = major === 2 ? 6 : 10;

  while (offset + headerLength <= body.length) {
    if (body[offset] === 0) {
      // Padding: every remaining byte is zero.
      break;
    }
    const frameId = ascii(body, offset, idLength);
    const frameSize =
      major === 2
        ? uint24(body, offset + 3)
        : major === 4
          ? syncSafeInt(body, offset + 4)
          : uint32(body, offset + 4);

    if (frameSize <= 0 || offset + headerLength + frameSize > body.length) {
      break;
    }

    const frame = body.subarray(offset + headerLength, offset + headerLength + frameSize);
    bundle.frameCount += 1;

    const coreField = TEXT_FRAMES[frameId];
    const detailField = DETAIL_FRAMES[frameId];

    if (coreField !== undefined || detailField !== undefined) {
      const text = decodeTextFrame(frame);
      if (text !== null) {
        if (coreField !== undefined && NUMERIC_FIELDS.has(coreField)) {
          const numeric = coreField === "year" ? leadingYear(text) : leadingInteger(text);
          if (numeric !== null) {
            tags[coreField] = numeric as never;
          }
        } else if (coreField !== undefined) {
          tags[coreField] = text as never;
        }

        if (detailField !== undefined) {
          if (detailField === "bpm") {
            const numeric = leadingInteger(text);
            if (numeric !== null) {
              details.bpm = numeric;
            }
          } else if (detailField === "genre") {
            details.genre = resolveGenre(text);
          } else {
            details[detailField] = text as never;
          }
        }
      }
    } else if (COMMENT_FRAMES.has(frameId)) {
      const decoded = decodeDescribedFrame(frame);
      details.comment = details.comment ?? decoded.text;
      details.language = details.language ?? decoded.language;
    } else if (LYRICS_FRAMES.has(frameId)) {
      const decoded = decodeDescribedFrame(frame);
      details.lyrics = details.lyrics ?? decoded.text;
      details.language = details.language ?? decoded.language;
    } else if (frameId === "APIC" || frameId === "PIC") {
      // First picture wins: a tag with several carries the front cover first
      // far more often than not, and "the" artwork is what a list row needs.
      bundle.picture = bundle.picture ?? decodePictureFrame(frame, frameId === "PIC");
    }

    offset += headerLength + frameSize;
  }

  return bundle;
}

/**
 * The eight fields an import needs. A projection of `readAudioTagBundle`, so
 * the two can never disagree about what a frame said.
 */
export function readAudioTags(bytes: Uint8Array): AudioTags {
  return readAudioTagBundle(bytes).tags;
}
