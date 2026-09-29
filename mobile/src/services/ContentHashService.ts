import * as Crypto from "expo-crypto";
import { File } from "expo-file-system";
import { readAsStringAsync } from "expo-file-system/legacy";

import { readAudioTagBundle, type AudioTagBundle } from "@/lib/audioTags";
import { decodeBase64 } from "@/lib/base64";
import {
  CONTENT_HASH_CHUNK_BYTES,
  computeContentHashFromChunk,
  type Sha256,
} from "@/lib/contentHash";
import { onlineIdentity } from "@/lib/online";

const sha256: Sha256 = async (data) => {
  const bytes = new Uint8Array(data);
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes);
  return new Uint8Array(digest);
};

export type FileHashResult = {
  contentHash: string;
  fileSizeBytes: number;
  /** ID3v2 tags read from the very same buffer. Empty when the file has none. */
  tags: AudioTagBundle["tags"];
  /**
   * The rest of what the same tag held — extended frames and the embedded cover
   * picture. Free, because it comes out of the buffer the hash already read.
   *
   * A picture that overruns the 1 MB window is reported as absent rather than
   * truncated; `ArtworkService` re-reads the tag in full for those.
   */
  bundle: AudioTagBundle;
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
  const bundle = readAudioTagBundle(chunk);
  return { contentHash, fileSizeBytes, tags: bundle.tags, bundle };
}

/**
 * The identity of an online item, as a real SHA-256.
 *
 * Hashing rather than storing the raw `online:<source>:<id>` string keeps
 * `content_hash` meaning exactly one thing across the whole app — a SHA-256 of
 * whatever identifies the audio — so nothing downstream has to know that some
 * rows identify bytes and others identify an address.
 *
 * The input is the source's own id for the item, never the stream URL: those are
 * signed and rotate, and hashing one would give the same episode a new identity
 * every time the signature expired.
 */
export async function hashOnlineIdentity(
  sourceId: string,
  externalId: string,
): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    onlineIdentity(sourceId, externalId),
  );
}
