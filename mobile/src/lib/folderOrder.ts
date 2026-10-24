/**
 * How the Library's folder list is ordered.
 *
 * A folder the listener downloaded is the one they are most likely to open
 * next, so downloaded folders come first, newest download at the top. Device
 * folders have never been downloaded at all and keep their alphabetical order
 * below them — the same order the list had before downloads existed.
 *
 * Pure and separate from the query so the rule is testable without a database,
 * and so the fold/key/hash helpers never grow an ordering opinion of their own.
 */

import type { FolderSummary } from "@/lib/db/types";

export function sortFoldersByDownload(
  folders: readonly FolderSummary[],
): FolderSummary[] {
  return [...folders].sort((a, b) => {
    const aDownloaded = a.lastDownloadedAt;
    const bDownloaded = b.lastDownloadedAt;

    if (aDownloaded !== null && bDownloaded !== null && aDownloaded !== bDownloaded) {
      return bDownloaded - aDownloaded;
    }
    if (aDownloaded !== null && bDownloaded === null) {
      return -1;
    }
    if (aDownloaded === null && bDownloaded !== null) {
      return 1;
    }
    return a.name.localeCompare(b.name);
  });
}
