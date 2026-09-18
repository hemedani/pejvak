import * as Crypto from "expo-crypto";
import {
  documentDirectory,
  getInfoAsync,
  makeDirectoryAsync,
  writeAsStringAsync,
} from "expo-file-system/legacy";

import type { EmbeddedPicture } from "@/lib/audioTags";
import { encodeBase64 } from "@/lib/base64";
import { artworkExtension } from "@/lib/embeddedArtwork";
import { inspectAudioFile } from "@/services/AudioInspectionService";
import { LocalDBService } from "@/services/LocalDBService";

/**
 * Cover art on disk.
 *
 * Audio files are referenced in place and never copied, but their artwork is
 * the opposite: a picture living inside a 40 MB M4B cannot be handed to
 * `expo-image`, and re-reading the file for every list row would be absurd. So
 * the bytes are extracted once and written beside the database.
 *
 * Three decisions worth keeping:
 *
 * - **Stored under the document directory, not the cache.** The OS evicts a
 *   cache without asking, and a track whose `artwork_url` points at an evicted
 *   file renders as a blank tile rather than the gradient fallback. Document
 *   storage is app-private and outlives updates.
 * - **Named after a hash of the picture, not of the track.** Thirty chapters of
 *   one audiobook share one JPEG; hashing the image means they share one file
 *   on disk as well. It also makes a re-extraction idempotent.
 * - **Failure is silent and local.** No artwork means the tile keeps the
 *   gradient and initial it already drew. Nothing about an import or a screen
 *   may depend on a picture being present.
 */

const ARTWORK_DIRECTORY = "artwork";
/** A picture bigger than this is not a thumbnail, it is a poster. */
const MAX_ARTWORK_BYTES = 4 * 1024 * 1024;

function directoryUri(): string | null {
  return documentDirectory ? `${documentDirectory}${ARTWORK_DIRECTORY}/` : null;
}

/**
 * Writes a picture and returns the `file://` URI to show.
 *
 * The write is keyed on the image's own SHA-256, so an identical cover is
 * written once no matter how many tracks carry it, and a second extraction of
 * the same file is a no-op rather than a rewrite.
 */
export async function storeArtwork(picture: EmbeddedPicture): Promise<string | null> {
  const directory = directoryUri();
  if (!directory) {
    return null;
  }
  if (picture.data.length === 0 || picture.data.length > MAX_ARTWORK_BYTES) {
    return null;
  }

  // `expo-crypto` types its input as an `ArrayBuffer`-backed view, so the bytes
  // are copied into a fresh buffer rather than borrowed from the parsed tag.
  const digest = await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(picture.data));
  const hash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
  const uri = `${directory}${hash}.${artworkExtension(picture.mimeType)}`;

  const existing = await getInfoAsync(uri).catch(() => null);
  if (existing?.exists) {
    return uri;
  }

  try {
    await makeDirectoryAsync(directory, { intermediates: true });
    await writeAsStringAsync(uri, encodeBase64(picture.data), { encoding: "base64" });
  } catch {
    // A read-only or full filesystem must not fail an import.
    return null;
  }

  return uri;
}

/**
 * Reads a track's file and stores whatever cover it carries.
 *
 * Returns the URI, or null when there is nothing to store. This is the only
 * entry point both the import and the backfill use, so the two can never
 * disagree about which file a picture comes from.
 */
export async function extractAndStoreArtwork(
  uri: string,
  options: { fileName: string; fileSizeBytes: number },
): Promise<string | null> {
  const inspection = await inspectAudioFile(uri, { ...options, includeArtwork: true });
  if (!inspection.picture) {
    return null;
  }
  return storeArtwork(inspection.picture);
}

/**
 * Records the artwork an import already read out of the file.
 *
 * The scan's identification step reads the first megabyte for the content hash,
 * and the ID3 tag sits inside that same buffer — so at import time the picture
 * is free. This takes it and does the bookkeeping around it.
 *
 * The three outcomes matter and are not interchangeable:
 *
 * - a picture was found → write it and point the row at it;
 * - no picture and the tag was read in full → stamp the row, because a file
 *   with no cover art must not be read again on every backfill pass;
 * - no picture and the tag was *truncated* → stamp nothing. The picture may be
 *   sitting past the 1 MB the scan read, and only a bigger read can tell.
 */
export async function saveImportedArtwork(
  trackId: string,
  picture: EmbeddedPicture | null,
  tagTruncated: boolean,
): Promise<void> {
  if (picture) {
    const uri = await storeArtwork(picture);
    // A picture that could not be written leaves the row unstamped, so the
    // backfill retries instead of recording artwork that is not on disk.
    if (uri) {
      await LocalDBService.setTrackArtwork(trackId, uri);
    }
    return;
  }

  if (!tagTruncated) {
    await LocalDBService.markTrackArtworkChecked(trackId);
  }
}

export type BackfillOutcome = {
  /** Tracks examined this pass. */
  scanned: number;
  /** Tracks whose file carried a picture that is now on disk. */
  found: number;
  /** Tracks examined whose file carries no picture at all. */
  empty: number;
  /**
   * Tracks whose file could not be read. Counted apart from `empty` because
   * "no picture in this file" and "could not look" are different answers, and
   * only the first one is a settled fact about the library.
   */
  failed: number;
};

/**
 * Extracts cover art for tracks that were imported before it was extracted.
 *
 * Bounded on purpose. A library imported in one go can be thousands of files,
 * and each one costs a read; a pass of a few dozen finishes quickly enough to
 * sit behind a screen refresh, and the caller simply runs another.
 *
 * Every examined row is stamped, whether or not a picture was found, so a file
 * that carries none is never read twice — that is the whole reason
 * `artwork_checked_at` exists. A row whose read *failed* is deliberately left
 * unstamped: the failure may be a revoked grant that a later pass can fix.
 */
export async function backfillArtwork(
  options: {
    limit?: number;
    onProgress?: (done: number, total: number) => void;
    isCancelled?: () => boolean;
  } = {},
): Promise<BackfillOutcome> {
  const limit = options.limit ?? 25;
  const tracks = await LocalDBService.getTracksMissingArtwork(limit);
  const outcome: BackfillOutcome = { scanned: 0, found: 0, empty: 0, failed: 0 };

  for (const track of tracks) {
    if (options.isCancelled?.()) {
      break;
    }
    outcome.scanned += 1;
    options.onProgress?.(outcome.scanned, tracks.length);

    const uri = track.fileUri ?? track.sourceUri;
    if (!uri) {
      // Stamped, unlike a failed read: a row with no URI can never yield a
      // picture, so there is nothing a later pass could learn. Leaving it
      // unstamped would also let it occupy a slot in every pass forever, which
      // is a pass that never finishes.
      await LocalDBService.markTrackArtworkChecked(track.id);
      outcome.empty += 1;
      continue;
    }

    try {
      const artwork = await extractAndStoreArtwork(uri, {
        fileName: track.fileName ?? track.title,
        fileSizeBytes: track.fileSizeBytes,
      });
      if (artwork) {
        await LocalDBService.setTrackArtwork(track.id, artwork);
        outcome.found += 1;
      } else {
        await LocalDBService.markTrackArtworkChecked(track.id);
        outcome.empty += 1;
      }
    } catch {
      // An unreadable or revoked file is the relink screen's business, not this
      // one's. Leave the row unstamped so a later pass can try again.
      outcome.failed += 1;
    }
  }

  return outcome;
}

/** How many playable tracks still have to be examined for cover art. */
export function countTracksMissingArtwork(): Promise<number> {
  return LocalDBService.countTracksMissingArtwork();
}
