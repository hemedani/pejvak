/**
 * Cover art embedded in an audio file, extracted from a byte window.
 *
 * Three containers matter here, and each hides its picture somewhere different:
 * ID3v2 keeps it in an `APIC` frame at the head of the file, FLAC in a
 * `PICTURE` metadata block, and MP4 in a `covr` box under
 * `moov/udta/meta/ilst` — which for an M4A or M4B is usually at the *end*.
 *
 * Pure, like the other readers: no file access, no storage, no decisions about
 * where the bytes end up. `ArtworkService` does that half.
 */

import { FLAC_PICTURE_BLOCK, flacMetadataBlocks } from "@/lib/audioInfo";
import { readAudioTagBundle, sniffImageMime, type EmbeddedPicture } from "@/lib/audioTags";
import {
  findDescendant,
  matchesAscii,
  readAscii,
  readUint32BE,
  scanForMoov,
  type Atom,
} from "@/lib/mediaBytes";

export type ReadArtworkOptions = {
  /** Absolute file offset of `bytes[0]`. */
  byteOffset?: number;
  /** Real file length, needed to validate a box found in a tail window. */
  fileSizeBytes: number;
};

/** MP4 `data` box type codes that name an image format. */
const MP4_DATA_TYPES: Record<number, string> = {
  13: "image/jpeg",
  14: "image/png",
  27: "image/bmp",
};

const MIME_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  bmp: "image/bmp",
  webp: "image/webp",
};

/**
 * The picture inside a FLAC `PICTURE` block.
 *
 * Layout: type(4) mimeLength(4) mime descriptionLength(4) description
 * width(4) height(4) depth(4) colors(4) dataLength(4) data.
 */
function readFlacPicture(bytes: Uint8Array, block: { start: number; length: number }): EmbeddedPicture | null {
  const end = block.start + block.length;
  if (block.start + 32 > end || end > bytes.length) {
    return null;
  }

  const mimeLength = readUint32BE(bytes, block.start + 4);
  const mimeStart = block.start + 8;
  const descriptionLength = readUint32BE(bytes, mimeStart + mimeLength);
  // 4 bytes of picture type + 4 of MIME length + the MIME string.
  const dataLengthAt = mimeStart + mimeLength + 4 + descriptionLength + 16;
  if (dataLengthAt + 4 > end) {
    return null;
  }

  const dataLength = readUint32BE(bytes, dataLengthAt);
  const dataStart = dataLengthAt + 4;
  if (dataLength === 0 || dataStart + dataLength > end || dataStart + dataLength > bytes.length) {
    return null;
  }

  const data = bytes.subarray(dataStart, dataStart + dataLength);
  const declared = readAscii(bytes, mimeStart, mimeLength).trim().toLowerCase();
  return {
    mimeType: sniffImageMime(data) ?? (declared.length > 0 ? declared : null),
    pictureType: readUint32BE(bytes, block.start),
    data,
  };
}

/**
 * The picture inside an MP4 `covr` box.
 *
 * `covr` holds one or more `data` boxes; the first that carries a recognised
 * image is used. A `data` box is size(4) `data`(4) dataType(4) locale(4) then
 * the payload, so the payload starts 16 bytes in.
 */
function readMp4Cover(bytes: Uint8Array, moov: Atom): EmbeddedPicture | null {
  const covr = findDescendant(bytes, moov, ["udta", "meta", "ilst", "covr"]);
  if (!covr) {
    return null;
  }

  let offset = covr.start + covr.headerBytes;
  while (offset + 16 <= covr.end) {
    const size = readUint32BE(bytes, offset);
    if (size < 16 || offset + size > covr.end || !matchesAscii(bytes, offset + 4, "data")) {
      break;
    }
    const dataType = readUint32BE(bytes, offset + 8);
    const payload = bytes.subarray(offset + 16, offset + size);
    const sniffed = sniffImageMime(payload);
    if (payload.length > 0 && (sniffed !== null || MP4_DATA_TYPES[dataType] !== undefined)) {
      return {
        mimeType: sniffed ?? MP4_DATA_TYPES[dataType] ?? null,
        pictureType: 3,
        data: payload,
      };
    }
    offset += size;
  }

  return null;
}

/**
 * Extracts the cover picture from whichever container the window holds.
 *
 * Returns null rather than a partial image when the picture runs past the end
 * of the window: half a JPEG is a broken tile on screen, where "no artwork"
 * renders as the intended gradient tile. The caller can re-read a larger window
 * and try again — which is exactly what `ArtworkService` does when a tag
 * declares more bytes than it was given.
 */
export function readEmbeddedArtwork(
  bytes: Uint8Array,
  options: ReadArtworkOptions,
): EmbeddedPicture | null {
  if (bytes.length === 0) {
    return null;
  }

  const base = options.byteOffset ?? 0;

  if (base > 0) {
    const moov = scanForMoov(bytes, options.fileSizeBytes, base);
    return moov ? readMp4Cover(bytes, moov) : null;
  }

  if (matchesAscii(bytes, 0, "ID3")) {
    return readAudioTagBundle(bytes).picture;
  }

  if (matchesAscii(bytes, 0, "fLaC")) {
    const picture = flacMetadataBlocks(bytes).find((block) => block.type === FLAC_PICTURE_BLOCK);
    return picture ? readFlacPicture(bytes, picture) : null;
  }

  if (matchesAscii(bytes, 4, "ftyp")) {
    const moov = scanForMoov(bytes, options.fileSizeBytes, 0);
    return moov ? readMp4Cover(bytes, moov) : null;
  }

  return null;
}

/** File extension for a picture MIME type, so the written file has a real name. */
export function artworkExtension(mimeType: string | null): string {
  switch (mimeType) {
    case "image/png":
      return "png";
    case "image/gif":
      return "gif";
    case "image/bmp":
      return "bmp";
    case "image/webp":
      return "webp";
    default:
      return "jpg";
  }
}

/** MIME type for a stored artwork file's extension. */
export function artworkMimeType(extension: string): string | null {
  return MIME_BY_EXTENSION[extension.toLowerCase()] ?? null;
}
