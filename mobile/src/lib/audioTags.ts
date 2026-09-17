/**
 * A minimal ID3v2 reader, pure and dependency-free.
 *
 * It exists because the scan already reads the first megabyte of every new file
 * to compute its SHA-256 content hash, and an ID3v2 tag lives at offset 0 of
 * that very same buffer. Parsing it here therefore costs no extra I/O and no
 * extra native module — the alternative (`react-native-get-music-files` or a
 * native tag reader) would mean a second dependency and a second read per file.
 *
 * Scope is deliberately narrow: text frames only. Attached pictures, lyrics and
 * chapter frames are skipped, not parsed.
 *
 * Decoding is hand-rolled rather than delegated to `TextDecoder`, whose
 * availability varies across Hermes builds.
 */

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

/** Frame id to field. v2.2 uses three-character ids, v2.3/v2.4 use four. */
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

const NUMERIC_FIELDS: ReadonlySet<keyof AudioTags> = new Set([
  "trackNumber",
  "discNumber",
  "year",
  "movementNumber",
]);

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

/** Text frames are null-separated when they carry multiple values. */
function firstValue(text: string): string | null {
  const value = text.split("\u0000")[0]?.trim() ?? "";
  return value.length > 0 ? value : null;
}

function decodeTextFrame(body: Uint8Array): string | null {
  if (body.length < 1) {
    return null;
  }
  const payload = body.subarray(1);
  switch (body[0]) {
    case 0:
      return firstValue(decodeLatin1(payload));
    case 1:
      return firstValue(decodeUtf16(payload, true));
    case 2:
      return firstValue(decodeUtf16(payload, false));
    case 3:
      return firstValue(decodeUtf8(payload));
    default:
      return null;
  }
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
 * Reads the ID3v2 tag at the start of `bytes`. Returns empty tags for anything
 * that is not a well-formed ID3v2 header — a malformed tag must never fail an
 * import, since the filename fallback still gives us a usable title.
 */
export function readAudioTags(bytes: Uint8Array): AudioTags {
  const tags: AudioTags = { ...EMPTY_AUDIO_TAGS };
  if (bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) {
    return tags;
  }

  const major = bytes[3];
  if (major < 2 || major > 4) {
    return tags;
  }

  const flags = bytes[5];
  const tagEnd = Math.min(10 + syncSafeInt(bytes, 6), bytes.length);
  let body = bytes.subarray(10, tagEnd);
  if ((flags & 0x80) !== 0) {
    body = deunsynchronise(body);
  }

  let offset = 0;
  if ((flags & 0x40) !== 0) {
    // Extended header. v2.4's size field counts itself; v2.3's does not.
    if (body.length < 4) {
      return tags;
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

    const field = TEXT_FRAMES[frameId];
    if (field !== undefined) {
      const text = decodeTextFrame(body.subarray(offset + headerLength, offset + headerLength + frameSize));
      if (text !== null) {
        if (NUMERIC_FIELDS.has(field)) {
          const numeric = field === "year" ? leadingYear(text) : leadingInteger(text);
          if (numeric !== null) {
            tags[field] = numeric as never;
          }
        } else {
          tags[field] = text as never;
        }
      }
    }

    offset += headerLength + frameSize;
  }

  return tags;
}
