/**
 * What is broken, and what is at stake.
 *
 * A track is "referenced in place": the row records where the device's file
 * lives and no audio is copied, which is what keeps a 20 GB library from
 * becoming a 40 GB one — at the cost of files that can move out from under it.
 * `contentHash` is the identity that survives the move, and this service is how
 * the app tells the listener which rows are waiting to be re-pointed.
 *
 * It deliberately does not relink anything itself. The relink is done by the
 * scan pipeline (`ImportService`), which already has the file, the hash and the
 * folder grant in hand. A per-file "locate" flow was considered and dropped: a
 * document picked through SAF hands back a `content://` URI that the app cannot
 * hold a durable grant for, so a "fixed" track could break again after a
 * reboot. Pointing at the folder the files moved to grants persistent access,
 * and the app already stores that grant.
 */

import type { LocalTrack } from "@/lib/db/types";
import { formatDuration } from "@/lib/history";
import { naturalCompare } from "@/lib/mediaFolders";
import { LocalDBService } from "@/services/LocalDBService";

export type MissingTrack = {
  track: LocalTrack;
  sessionCount: number;
  listenedSec: number;
  annotationCount: number;
};

/** Missing tracks that came from the same folder — which is what to point the scan at. */
export type MissingGroup = {
  folderKey: string | null;
  folderName: string;
  tracks: MissingTrack[];
};

/** Every track whose file is gone, newest first, with what is recorded against it. */
async function listMissing(): Promise<MissingTrack[]> {
  const tracks = await LocalDBService.getTracksByAvailability("missing");
  const counts = await LocalDBService.getTrackActivityCounts(tracks.map((track) => track.id));
  return tracks.map((track) => {
    const entry = counts.get(track.id);
    return {
      track,
      sessionCount: entry?.sessionCount ?? 0,
      listenedSec: entry?.listenedSec ?? 0,
      annotationCount: entry?.annotationCount ?? 0,
    };
  });
}

const NO_FOLDER = "No folder";

/**
 * Groups by source folder, so the screen can say *which* folder to point the
 * scan at rather than dumping a flat list of filenames. Groups are ordered by
 * name; tracks with no folder key come last, since they are the ones a folder
 * scan cannot reach.
 */
export function groupByFolder(missing: readonly MissingTrack[]): MissingGroup[] {
  const groups = new Map<string | null, MissingGroup>();

  for (const item of missing) {
    const key = item.track.folderKey;
    const existing = groups.get(key);
    if (existing) {
      existing.tracks.push(item);
      continue;
    }
    groups.set(key, {
      folderKey: key,
      folderName: item.track.folderName ?? (key === null ? NO_FOLDER : key),
      tracks: [item],
    });
  }

  return [...groups.values()].sort((left, right) => {
    if (left.folderKey === null) {
      return right.folderKey === null ? 0 : 1;
    }
    if (right.folderKey === null) {
      return -1;
    }
    return naturalCompare(left.folderName, right.folderName);
  });
}

/**
 * What relinking this track saves, or `null` when nothing is recorded against it.
 *
 * A track that was imported but never played has no history to lose, and saying
 * "0 sessions" would only add noise to the row that most needs a clear action.
 */
export function describeStake(
  missing: Pick<MissingTrack, "sessionCount" | "listenedSec" | "annotationCount">,
): string | null {
  const parts: string[] = [];
  if (missing.sessionCount > 0) {
    parts.push(`${missing.sessionCount} session${missing.sessionCount === 1 ? "" : "s"}`);
  }
  if (missing.listenedSec > 0) {
    parts.push(`${formatDuration(missing.listenedSec)} listened`);
  }
  if (missing.annotationCount > 0) {
    parts.push(`${missing.annotationCount} note${missing.annotationCount === 1 ? "" : "s"}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/** The headline: how many files, and how much listening they are holding. */
export function summariseMissing(missing: readonly MissingTrack[]): string {
  if (missing.length === 0) {
    return "Every file is where it should be.";
  }
  const listenedSec = missing.reduce((total, item) => total + item.listenedSec, 0);
  const files = `${missing.length} file${missing.length === 1 ? "" : "s"} missing`;
  return listenedSec > 0 ? `${files} · ${formatDuration(listenedSec)} of listening at stake` : files;
}

export const RelinkService = {
  listMissing,
};
