/**
 * A track's state as the one status line a row may carry.
 *
 * Availability is a property of the row, not a guess made by the screen. A
 * missing file and a stream are both facts the listener has to be told before
 * they tap, and both are answered the same way on every list that shows a
 * track — the Library, a folder, a search result.
 *
 * A downloaded online track has a local path in `file_uri`, so it is not a
 * stream any more; the check is the scheme, never `origin`.
 */

import { isStreamUri } from "@/lib/audioLocation";
import type { LocalTrack } from "@/lib/db/types";
import type { StatusSpec } from "@/lib/rowStatus";

export function describeTrackStatus(
  track: Pick<LocalTrack, "availability" | "fileUri">,
): StatusSpec | null {
  if (track.availability === "missing") {
    return { kind: "missing", label: "File missing" };
  }
  if (track.fileUri !== null && isStreamUri(track.fileUri)) {
    return { kind: "streamed", label: "Streams" };
  }
  return null;
}
