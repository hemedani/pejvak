import { mimeTypeForFileName } from "@/lib/audioFormats";
import type { LocalTrack } from "@/lib/db/types";
import { resolveTrackMetadata } from "@/lib/importMetadata";
import type { LibraryEntry } from "@/lib/scanPlan";
import { saveImportedArtwork } from "@/services/ArtworkService";
import type { FolderGrant, IdentifiedFile } from "@/services/DeviceScanService";
import { isLocationReachable } from "@/services/FileLocationService";
import { LocalDBService } from "@/services/LocalDBService";
import { syncPending } from "@/services/SyncService";

/**
 * The only place a scan turns into rows.
 *
 * Everything imported here is **referenced in place**: the track records the
 * device's own URI and no audio bytes are copied. That keeps a 20 GB audiobook
 * library from becoming a 40 GB one, at the cost of files that can disappear —
 * which is what `availability` and the relink path exist to handle.
 */

export type ImportOutcome = {
  imported: LocalTrack[];
  /** Already in the library under the same content hash, at a location that still works. */
  duplicates: number;
  /** Files that had gone missing and were re-pointed at the location they moved to. */
  relinked: number;
  failed: number;
};

/**
 * The slice of the library the scan planner compares against. Reads only the
 * columns the planner needs — a full `LocalTrack` per row would be wasteful on a
 * library of several thousand tracks.
 *
 * `availability` is part of that slice because it is the only thing separating
 * "you already have this file" from "this is the file you lost".
 */
export async function loadLibraryIndex(): Promise<LibraryEntry[]> {
  const tracks = await LocalDBService.getAllTracks();
  return tracks.map((track) => ({
    contentHash: track.contentHash,
    sourceUri: track.sourceUri,
    sourceSize: track.sourceSize,
    sourceMtime: track.sourceMtime,
    title: track.title,
    durationSec: track.durationSec,
    availability: track.availability,
  }));
}

/**
 * Which of the given rows' recorded locations no longer resolve.
 *
 * This is what lets a scan tell "I already have this file" from "this is the
 * file I lost". Pass it the rows from `libraryEntriesToVerify`, not the whole
 * library: a stat is cheap but not free, and only rows a discovered file could
 * match are ever candidates for relinking.
 *
 * A moved folder cannot be relinked without this. The planner compares content
 * hashes, and the hash of a moved file is identical to the hash of the row it
 * left behind — so without asking the filesystem, every moved file reads as a
 * duplicate of itself and is skipped.
 */
export async function findGoneLocations(entries: LibraryEntry[]): Promise<Set<string>> {
  const gone = new Set<string>();
  await Promise.all(
    entries.map(async (entry) => {
      if (entry.sourceUri && !(await isLocationReachable(entry.sourceUri))) {
        gone.add(entry.sourceUri);
      }
    }),
  );
  return gone;
}

export async function importIdentifiedFiles(
  files: IdentifiedFile[],
  options: {
    /** Tree grants to persist, so folder access survives a relaunch. */
    grants?: FolderGrant[];
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<ImportOutcome> {
  for (const grant of options.grants ?? []) {
    await LocalDBService.upsertFolder({
      key: grant.folderKey,
      name: grant.folderName,
      treeUri: grant.treeUri,
    }).catch(() => undefined);
  }

  const imported: LocalTrack[] = [];
  let duplicates = 0;
  let relinked = 0;
  let failed = 0;
  let done = 0;

  for (const entry of files) {
    try {
      const existing = await LocalDBService.getTrackByContentHash(entry.contentHash);
      const recordedUri = existing ? (existing.fileUri ?? existing.sourceUri) : null;
      // `availability` is only set by something that already looked, and a
      // rescan cannot see an absence — so a row whose file was deleted and never
      // played still claims to be present. Checking the location here is what
      // makes a moved folder relinkable instead of silently skipped.
      const movedToANewLocation =
        existing !== null &&
        existing.availability !== "missing" &&
        recordedUri !== null &&
        recordedUri !== entry.file.uri &&
        !(await isLocationReachable(recordedUri));

      if (existing && (existing.availability === "missing" || movedToANewLocation)) {
        // The same content, previously gone: this is the file that moved, found
        // again. Re-point the row that already exists instead of inserting a
        // second one — the sessions and annotations hanging off it are the whole
        // reason `contentHash` is the identity, and a fresh row would orphan
        // them while the listener's history silently vanished.
        await LocalDBService.updateTrackLocation(existing.id, {
          sourceUri: entry.file.uri,
          sourcePath: entry.file.path,
          sourceSize: entry.fileSizeBytes,
          sourceMtime: entry.file.modifiedAt,
          folderKey: entry.file.folderKey,
          folderName: entry.file.folderName,
        });
        // The row's location changed, so its cover has to be re-read from the
        // file that is actually there now.
        await saveImportedArtwork(existing.id, entry.picture, entry.tagTruncated).catch(
          () => undefined,
        );
        relinked += 1;
      } else if (existing) {
        // The scan plan could not know this without hashing; the hash is the
        // authority on identity. The row's own location still resolves, so this
        // really is a second copy — re-pointing it would move a row that was
        // never lost, and the copy is playable as it stands.
        duplicates += 1;
      } else {
        // Captured before the insert, or this would find the row we just wrote.
        const previous = await LocalDBService.getTrackBySourceUri(entry.file.uri);

        const metadata = resolveTrackMetadata({
          fileName: entry.file.fileName,
          durationSec: entry.file.durationSec,
          tags: entry.tags,
        });

        const track = await LocalDBService.insertTrack({
          contentHash: entry.contentHash,
          title: metadata.title,
          fileName: entry.file.fileName,
          fileUri: entry.file.uri,
          durationSec: entry.file.durationSec,
          fileSizeBytes: entry.fileSizeBytes,
          mimeType: mimeTypeForFileName(entry.file.fileName),
          isAudiobook: metadata.isAudiobook,
          author: metadata.author,
          album: metadata.album,
          trackNumber: metadata.trackNumber,
          discNumber: metadata.discNumber,
          year: metadata.year,
          source: entry.file.source,
          sourceUri: entry.file.uri,
          sourcePath: entry.file.path,
          sourceSize: entry.fileSizeBytes,
          sourceMtime: entry.file.modifiedAt,
          folderKey: entry.file.folderKey,
          folderName: entry.file.folderName,
        });
        imported.push(track);

        // The cover came out of the buffer the hash was computed from, so this
        // costs no extra read. It must never be able to fail an import, hence
        // the swallowed rejection: a track with no artwork is a tile with a
        // gradient, and that is a fine outcome.
        await saveImportedArtwork(track.id, entry.picture, entry.tagTruncated).catch(
          () => undefined,
        );

        if (previous && previous.contentHash !== entry.contentHash) {
          // The file was replaced since we last saw it. The old row's history is
          // still real, but it must stop presenting itself as playable.
          await LocalDBService.setTrackAvailability(previous.id, "missing");
        }
      }
    } catch {
      failed += 1;
    }

    done += 1;
    options.onProgress?.(done, files.length);
  }

  if (imported.length > 0) {
    void syncPending().catch(() => undefined);
  }

  return { imported, duplicates, relinked, failed };
}
