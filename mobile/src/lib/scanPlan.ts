/**
 * Classifies what a device scan found, before a single byte is written.
 *
 * The scan is two-phase on purpose. Phase 1 (this file) is pure bookkeeping:
 * it compares the media index against the library and decides, per file,
 * whether anything needs to happen at all. Phase 2 reads file bytes — the
 * expensive part — and only for the candidates this plan marks as needing it.
 *
 * Keeping this pure means the whole "312 found, 41 new, 12 duplicates" decision
 * is unit-testable without a device, a filesystem or a database.
 */

import { naturalCompare } from "@/lib/mediaFolders";
import type { TrackAvailability, TrackSource } from "@/lib/db/types";

export type DiscoveredFile = {
  /** Stable identifier for the source location: a MediaStore asset id or a SAF document URI. */
  sourceId: string;
  /** The URI handed to the player. */
  uri: string;
  /** Filesystem path when one is known; drives folder derivation. */
  path: string | null;
  fileName: string;
  /** Null when the source does not report a size — the Android media index does not. */
  sizeBytes: number | null;
  modifiedAt: number | null;
  /** From the media index; 0 when the source does not report a duration. */
  durationSec: number;
  source: TrackSource;
  folderKey: string | null;
  folderName: string | null;
};

/**
 * - `new` — not in the library; needs identifying and importing.
 * - `known` — already imported from this exact location, unchanged; nothing to do.
 * - `changed` — already imported from this location but the file differs; re-identify.
 * - `duplicate` — a different location holding content we already have (or that
 *   another candidate in this same scan already covers).
 * - `relink` — looks like a library track whose file is *gone*. Not a duplicate:
 *   the same content at a new location is the file that moved, and re-pointing
 *   the existing row is what saves its history and annotations.
 */
export type ScanStatus = "new" | "known" | "changed" | "duplicate" | "relink";

export type ScanCandidate = DiscoveredFile & {
  status: ScanStatus;
  /** For `duplicate` and `relink`, what it matches: a content hash or a sibling `sourceId`. */
  duplicateOf: string | null;
};

export type ScanSummary = {
  total: number;
  new: number;
  known: number;
  changed: number;
  duplicate: number;
  relink: number;
  /** How many files phase 2 will have to open. This is the cost the plan exists to reduce. */
  identifyCount: number;
};

export type ScanPlan = {
  candidates: ScanCandidate[];
  summary: ScanSummary;
};

/** The slice of a library track the planner needs. */
export type LibraryEntry = {
  contentHash: string;
  sourceUri: string | null;
  sourceSize: number | null;
  sourceMtime: number | null;
  title: string;
  durationSec: number;
  /**
   * Whether the file is still where we last saw it, as last *written* — the
   * planner also accepts a caller-verified `goneLocations` entry as evidence,
   * because this flag is only set by something that already looked. See
   * `isLocationGone`.
   */
  availability: TrackAvailability;
};

/**
 * Folds a title down to a comparison key: case, accents, punctuation, a leading
 * track number and the file extension all stop mattering.
 */
export function normaliseTitle(value: string): string {
  const decomposed = typeof value.normalize === "function" ? value.normalize("NFD") : value;
  return decomposed
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\.[a-z0-9]{1,5}$/, "")
    .replace(/^\s*\d{1,3}\s*[-–—_.)\]]\s*/, "")
    .replace(/[^a-z0-9]+/g, "");
}

/** Duration agreement within 1% (at least 2 s), which absorbs re-encode padding. */
function durationsAgree(leftSec: number, rightSec: number): boolean {
  if (leftSec <= 0 || rightSec <= 0) {
    return false;
  }
  const tolerance = Math.max(2, Math.round(Math.max(leftSec, rightSec) * 0.01));
  return Math.abs(leftSec - rightSec) <= tolerance;
}

/**
 * Same title and same length — a re-encode, or a second copy of one recording.
 *
 * Both durations must be *known* and must agree. A title alone is far too weak
 * a signal to hide a file behind, and a false duplicate silently loses the
 * user's audio; when the duration is unknown we say "not a duplicate" and let
 * the identify pass settle it with a real content hash.
 */
export function isNearDuplicate(
  left: { title: string; durationSec: number },
  right: { title: string; durationSec: number },
): boolean {
  const leftTitle = normaliseTitle(left.title);
  const rightTitle = normaliseTitle(right.title);
  if (leftTitle.length === 0 || leftTitle !== rightTitle) {
    return false;
  }
  return durationsAgree(left.durationSec, right.durationSec);
}

/** Case-insensitive filename equality. */
export function isSameFileName(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

/**
 * Whether a candidate has to have its bytes read before anything can be decided.
 *
 * One predicate, used both to size the phase-2 cost and to select the files that
 * pass actually opens — so the preview's "identifying N files" can never
 * disagree with how many are opened.
 *
 * A `relink` is included deliberately: the plan matched it on title and
 * duration, which is far too weak a signal to re-point a row on. Only the hash
 * settles it.
 */
export function needsIdentification(status: ScanStatus): boolean {
  return status === "new" || status === "changed" || status === "relink";
}

/** No recorded locations are known to be gone. */
const NO_GONE_LOCATIONS: ReadonlySet<string> = new Set();

/**
 * Whether a library row's own file is known to be gone.
 *
 * Two sources of the same fact: `availability` when something already wrote it
 * (a play failure, or a replace at the same URI), and `goneLocations` when the
 * caller went and looked. Either is enough, and neither is a guess.
 */
function isLocationGone(entry: LibraryEntry, goneLocations: ReadonlySet<string>): boolean {
  return (
    entry.availability === "missing" ||
    (entry.sourceUri !== null && goneLocations.has(entry.sourceUri))
  );
}

/**
 * The library rows whose recorded location is worth checking, given what the
 * scan found.
 *
 * Narrowed deliberately: asking the filesystem about every row would be
 * thousands of stats to resolve a handful of duplicates, and only a row whose
 * title a discovered file could match is ever a candidate for relinking.
 *
 * Rows already flagged `missing` are left out — the answer is known, and a stat
 * would only confirm it. So are rows with no recorded URI, which have nothing to
 * check and are already treated as gone by `isLocationGone`.
 *
 * Pure, so the caller can size the work before doing it and the rule stays
 * testable without a device.
 */
export function libraryEntriesToVerify(
  files: DiscoveredFile[],
  library: LibraryEntry[],
): LibraryEntry[] {
  const discoveredTitles = new Set<string>();
  for (const file of files) {
    const key = normaliseTitle(file.fileName);
    if (key.length > 0) {
      discoveredTitles.add(key);
    }
  }

  const seenUris = new Set<string>();
  const result: LibraryEntry[] = [];
  for (const entry of library) {
    if (!entry.sourceUri || entry.availability === "missing" || seenUris.has(entry.sourceUri)) {
      continue;
    }
    const key = normaliseTitle(entry.title);
    if (key.length === 0 || !discoveredTitles.has(key)) {
      continue;
    }
    seenUris.add(entry.sourceUri);
    result.push(entry);
  }
  return result;
}

/**
 * Normalises a source timestamp to milliseconds.
 *
 * The two scan sources disagree: `expo-file-system` reports modification time in
 * seconds, while the media index reports a JavaScript-style millisecond value.
 * Left unnormalised, the same untouched file would look "changed" on every
 * rescan that reached it through the other source, and would be re-hashed
 * forever. 1e11 ms is 1973, so anything below it is unambiguously seconds.
 */
export function toEpochMillis(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
}

function compareCandidates(left: ScanCandidate, right: ScanCandidate): number {
  const leftFolder = left.folderKey ?? "";
  const rightFolder = right.folderKey ?? "";
  if (leftFolder !== rightFolder) {
    return naturalCompare(leftFolder, rightFolder);
  }
  return naturalCompare(left.fileName, right.fileName);
}

/**
 * Builds the plan. `files` may arrive in any order and may contain repeats from
 * overlapping scan sources (a granted folder that the media index also covers),
 * which the sibling pass below collapses.
 *
 * `goneLocations` holds the URIs the caller found to be unreachable — see
 * `libraryEntriesToVerify` for which rows to ask about. It is an argument rather
 * than a lookup so this stays pure and testable without a device; a scan that
 * passes nothing simply cannot tell a moved file from a duplicate, and says so
 * by classifying both as `duplicate`.
 */
export function buildScanPlan(
  files: DiscoveredFile[],
  library: LibraryEntry[],
  goneLocations: ReadonlySet<string> = NO_GONE_LOCATIONS,
): ScanPlan {
  const bySourceUri = new Map<string, LibraryEntry>();
  const libraryByTitle = new Map<string, LibraryEntry[]>();

  for (const entry of library) {
    if (entry.sourceUri) {
      bySourceUri.set(entry.sourceUri, entry);
    }
    const key = normaliseTitle(entry.title);
    if (key.length > 0) {
      const bucket = libraryByTitle.get(key);
      if (bucket) {
        bucket.push(entry);
      } else {
        libraryByTitle.set(key, [entry]);
      }
    }
  }

  // Candidates seen so far in *this* scan, keyed by title, so a file reachable
  // through two sources is only imported once.
  const seenInScan = new Map<string, ScanCandidate>();
  const candidates: ScanCandidate[] = [];

  for (const file of files) {
    const existing = bySourceUri.get(file.uri);
    const titleKey = normaliseTitle(file.fileName);
    const subject = { title: file.fileName, durationSec: file.durationSec };

    let status: ScanStatus;
    let duplicateOf: string | null = null;

    if (existing) {
      // Modification time is the primary rescan key, because it is the only
      // signal the Android media index actually reports. Size corroborates it
      // when both sides know it — a file edited to the same byte length within
      // the same millisecond is not a case worth re-reading for.
      const mtimeMatches =
        existing.sourceMtime !== null &&
        file.modifiedAt !== null &&
        existing.sourceMtime === file.modifiedAt;
      const sizeMatches =
        existing.sourceSize === null ||
        file.sizeBytes === null ||
        existing.sourceSize === file.sizeBytes;
      status = mtimeMatches && sizeMatches ? "known" : "changed";
    } else {
      const sibling = titleKey.length > 0 ? seenInScan.get(titleKey) : undefined;
      // Within one scan, the same filename twice is a double-discovery rather
      // than two distinct recordings, so filename equality is enough here. The
      // library comparison below stays stricter.
      const siblingMatch =
        sibling &&
        (isSameFileName(sibling.fileName, file.fileName) ||
          isNearDuplicate(
            { title: sibling.fileName, durationSec: sibling.durationSec },
            subject,
          ))
          ? sibling
          : undefined;

      // A near-duplicate whose file is *gone* is preferred over one that is
      // still present: relinking it is the only outcome that restores history,
      // whereas the present copy would earn a no-op.
      const nearDuplicates = (
        titleKey.length > 0 ? (libraryByTitle.get(titleKey) ?? []) : []
      ).filter((entry) => isNearDuplicate({ title: entry.title, durationSec: entry.durationSec }, subject));
      const libraryMatch =
        nearDuplicates.find((entry) => isLocationGone(entry, goneLocations)) ?? nearDuplicates[0];

      if (siblingMatch) {
        status = "duplicate";
        duplicateOf = siblingMatch.sourceId;
      } else if (libraryMatch) {
        status = isLocationGone(libraryMatch, goneLocations) ? "relink" : "duplicate";
        duplicateOf = libraryMatch.contentHash;
      } else {
        status = "new";
      }
    }

    const candidate: ScanCandidate = { ...file, status, duplicateOf };
    candidates.push(candidate);

    if (status !== "duplicate" && titleKey.length > 0 && !seenInScan.has(titleKey)) {
      seenInScan.set(titleKey, candidate);
    }
  }

  candidates.sort(compareCandidates);

  const summary: ScanSummary = {
    total: candidates.length,
    new: 0,
    known: 0,
    changed: 0,
    duplicate: 0,
    relink: 0,
    identifyCount: 0,
  };
  for (const candidate of candidates) {
    summary[candidate.status] += 1;
    if (needsIdentification(candidate.status)) {
      summary.identifyCount += 1;
    }
  }

  return { candidates, summary };
}
