/**
 * Where an item's audio comes from, in one vocabulary.
 *
 * The library holds two kinds of thing that look identical in a list: a file
 * that lives on this phone, and an item served by an online source. The rows
 * already say a lot about *state* (finished, downloading, missing) but nothing
 * about *provenance*, so a downloaded course and an imported folder read the
 * same even though only one of them will still play on a plane.
 *
 * Three answers, not two, because a playlist is a container the listener built
 * and it can mix the two. Calling a mixed playlist "Local" would be a claim
 * about bytes it does not hold; calling it "Online" would hide the files on the
 * device. `mixed` says exactly what is true.
 *
 * Provenance is deliberately read from the stored `origin`, not from whether
 * the bytes happen to be here right now. A downloaded course keeps
 * `origin = 'online'` forever — that is where the listener found it and where
 * they will look for it again — while its download state is a separate,
 * already-spoken fact. Two badges that answer "where did this come from?" and
 * "is it on the device?" differently is the point, not a contradiction.
 *
 * The words live here and the glyph lives in `OriginBadge`, so `src/lib` never
 * imports an icon.
 */

import type {
  FolderSummary,
  LocalContextPlay,
  LocalPlaylist,
  LocalTrack,
  TrackOrigin,
} from "@/lib/db/types";
import { parseDownloadedFolderKey } from "@/lib/online/naming";

export type ItemOrigin = TrackOrigin | "mixed";

export type OriginSpec = {
  origin: ItemOrigin;
  /** The word in the badge. */
  label: string;
  /** Spoken form for an accessibility label, where "Online" alone is terse. */
  description: string;
};

const ORIGINS: Record<ItemOrigin, OriginSpec> = {
  local: {
    origin: "local",
    label: "Local",
    description: "Stored on this device",
  },
  online: {
    origin: "online",
    label: "Online",
    description: "From an online source",
  },
  mixed: {
    origin: "mixed",
    label: "Mixed",
    description: "Both on this device and from an online source",
  },
};

export function describeOrigin(origin: ItemOrigin): OriginSpec {
  return ORIGINS[origin];
}

/**
 * A track's provenance, straight from its own column.
 *
 * Null means a row written before the column existed; those are files the
 * device scanned, so `local` is the honest reading rather than "unknown".
 */
export function trackOrigin(track: Pick<LocalTrack, "origin">): ItemOrigin {
  return track.origin === "online" ? "online" : "local";
}

/**
 * A folder's provenance, from its key.
 *
 * A downloaded collection and a series are folders under `Online/` — that is
 * how `collectionFolderKey` minted them and how `getTracksByFolder` finds their
 * members — so the key is the only thing a folder has that remembers where it
 * came from. A device folder's key never starts with that root.
 */
export function folderOrigin(folder: Pick<FolderSummary, "key">): ItemOrigin {
  return parseDownloadedFolderKey(folder.key) === null ? "local" : "online";
}

/** One answer for a set of tracks: unanimous, empty, or mixed. */
export function tracksOrigin(origins: readonly TrackOrigin[]): ItemOrigin {
  if (origins.length === 0) {
    return "local";
  }
  const first = origins[0];
  return origins.every((origin) => origin === first) ? first : "mixed";
}

/**
 * A playlist's provenance, from the origins of its members.
 *
 * Needs the tracks, not just the playlist row: `items` holds ids, and a
 * playlist has no origin of its own. An id the caller could not resolve is
 * skipped rather than counted as local — a removed track is not evidence.
 */
export function playlistOrigin(
  playlist: Pick<LocalPlaylist, "items">,
  originOfTrackId: (trackId: string) => TrackOrigin | null,
): ItemOrigin {
  const origins: TrackOrigin[] = [];
  for (const item of playlist.items) {
    const origin = originOfTrackId(item.trackId);
    if (origin !== null) {
      origins.push(origin);
    }
  }
  return tracksOrigin(origins);
}

/**
 * A collection run's provenance.
 *
 * A run records the collection's type and key, so an `online` run is one whose
 * queue came from a source; a folder's key tells the same story as
 * `folderOrigin`. A playlist run is the listener's own list, which is local
 * even when some of its tracks stream — the container is what the row names.
 */
export function runOrigin(
  run: Pick<LocalContextPlay, "contextType" | "contextKey">,
): ItemOrigin {
  if (run.contextType === "online") {
    return "online";
  }
  if (run.contextType === "folder") {
    return parseDownloadedFolderKey(run.contextKey) === null ? "local" : "online";
  }
  return "local";
}
