import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { readAsStringAsync } from "expo-file-system/legacy";

import { readAudioTags, type AudioTags } from "@/lib/audioTags";
import {
  CONTENT_HASH_CHUNK_BYTES,
  computeContentHashFromChunk,
  type Sha256,
} from "@/lib/contentHash";

const sha256: Sha256 = async (data) => {
  const bytes = new Uint8Array(data);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return new Uint8Array(digest);
};

/**
 * Base64 decoder that does not depend on `atob` (availability varies across
 * Hermes builds). Only used to turn the bounded base64 file read back into bytes.
 */
function decodeBase64(input: string): Uint8Array {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Int16Array(128);
  for (let index = 0; index < alphabet.length; index++) {
    lookup[alphabet.charCodeAt(index)] = index;
  }

  const clean = input.replace(/=+$/, "");
  const bytes: number[] = [];
  let buffer = 0;
  let bits = 0;

  for (let index = 0; index < clean.length; index++) {
    buffer = (buffer << 6) | lookup[clean.charCodeAt(index)];
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      bytes.push((buffer >> bits) & 0xff);
    }
  }

  return new Uint8Array(bytes);
}

export type FileHashResult = {
  contentHash: string;
  fileSizeBytes: number;
  /** ID3v2 tags read from the very same buffer. Empty when the file has none. */
  tags: AudioTags;
};

/**
 * Computes a track's identity from a local file, and reads its ID3 tags on the
 * way past.
 *
 * Reads only the first 1 MB via the legacy `expo-file-system` API: the new File
 * API's `bytes`/`slice` gate reads behind a canonical-path permission check that
 * fails for picker cache paths inside Expo Go, whereas the legacy reader opens
 * the stream directly. That also makes it the one read that can serve both
 * purposes — an ID3v2 tag sits at offset 0 of the same buffer — so identifying a
 * file costs a single pass rather than one read per concern.
 *
 * `sizeBytes` should be supplied by callers that already know it (the media
 * index reports it, and `new File(uri).size` is not reliable for `content://`
 * URIs).
 */
export async function computeFileContentHash(
  uri: string,
  sizeBytes?: number,
): Promise<FileHashResult> {
  const fileSizeBytes = sizeBytes ?? new File(uri).size;
  const readLength = Math.min(Math.max(fileSizeBytes, 0), CONTENT_HASH_CHUNK_BYTES);
  const base64 = await readAsStringAsync(uri, {
    position: 0,
    length: readLength,
    encoding: "base64",
  });
  const chunk = decodeBase64(base64);
  const contentHash = await computeContentHashFromChunk(chunk, fileSizeBytes, sha256);
  return { contentHash, fileSizeBytes, tags: readAudioTags(chunk) };
}
