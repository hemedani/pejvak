import { mimeTypeForFileName } from "@/lib/audioFormats";
import type { LocalTrack } from "@/lib/db/types";
import { resolveTrackMetadata } from "@/lib/importMetadata";
import type { LibraryEntry } from "@/lib/scanPlan";
import type { FolderGrant, IdentifiedFile } from "@/services/DeviceScanService";
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
  /** Already in the library under the same content hash, reached by a different path. */
  duplicates: number;
  failed: number;
};

/**
 * The slice of the library the scan planner compares against. Reads only the
 * columns the planner needs — a full `LocalTrack` per row would be wasteful on a
 * library of several thousand tracks.
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
  }));
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
  let failed = 0;
  let done = 0;

  for (const entry of files) {
    try {
      const existing = await LocalDBService.getTrackByContentHash(entry.contentHash);
      if (existing) {
        // The scan plan could not know this without hashing; the hash is the
        // authority on identity, so the file is already here.
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

  return { imported, duplicates, failed };
}
