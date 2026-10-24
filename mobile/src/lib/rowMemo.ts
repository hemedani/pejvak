/**
 * Comparisons for rows that must not re-render when nothing they draw changed.
 *
 * `React.memo`'s shallow compare is right for most cards once their props are
 * referentially stable. A download row is different: its job object is rebuilt
 * by every progress poll, so shallow comparison would re-render the row four
 * times a second even when the bytes it shows did not move. The comparator here
 * compares the fields the row actually reads.
 */

import type { LocalDownloadJob, LocalTrack } from "@/lib/db/types";
import type { StatusSpec } from "@/lib/rowStatus";
import type { Range } from "@/lib/search";

export function rangesEqual(
  left?: readonly Range[],
  right?: readonly Range[],
): boolean {
  const a = left ?? [];
  const b = right ?? [];
  if (a === b) {
    return true;
  }
  if (a.length !== b.length) {
    return false;
  }
  return a.every((range, index) => {
    const other = b[index];
    return range.start === other.start && range.end === other.end;
  });
}

export function statusEqual(
  left?: StatusSpec | null,
  right?: StatusSpec | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return left.kind === right.kind && left.label === right.label && left.tone === right.tone;
}

function jobsEqual(
  left?: LocalDownloadJob | null,
  right?: LocalDownloadJob | null,
): boolean {
  if (left === right) {
    return true;
  }
  if (!left || !right) {
    return false;
  }
  return (
    left.id === right.id &&
    left.state === right.state &&
    left.bytesDone === right.bytesDone &&
    left.bytesTotal === right.bytesTotal
  );
}

export type OnlineTrackRowMemoProps = {
  track: LocalTrack;
  ordinal: number;
  isCurrent: boolean;
  job?: LocalDownloadJob | null;
  onPress: (trackId: string) => void;
  position?: "only" | "first" | "middle" | "last";
  cardWidth?: number;
};

/** Compares only what an online track row draws. */
export function onlineTrackRowPropsEqual(
  previous: OnlineTrackRowMemoProps,
  next: OnlineTrackRowMemoProps,
): boolean {
  return (
    previous.ordinal === next.ordinal &&
    previous.isCurrent === next.isCurrent &&
    previous.position === next.position &&
    previous.cardWidth === next.cardWidth &&
    previous.onPress === next.onPress &&
    previous.track.id === next.track.id &&
    previous.track.title === next.track.title &&
    previous.track.durationSec === next.track.durationSec &&
    previous.track.downloadedAt === next.track.downloadedAt &&
    jobsEqual(previous.job, next.job)
  );
}
