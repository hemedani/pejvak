/**
 * What the Library's "Recent" tab shows, and why it shows it that way.
 *
 * The list is built from *sessions*, not from `tracks.last_played_at`, and that
 * is the whole point: a session knows whether it was part of a collection. A
 * lecture heard inside "Physics 101" is a play of that folder, not a loose track
 * that happens to have been played — and a list built from track timestamps
 * could only ever say the second thing.
 *
 * Deduplicated by what was played, newest first: a folder heard five times is
 * one row, sitting where its most recent play puts it. That is what a "recently
 * played" list is for — getting back to something — rather than a log, which the
 * History tab already is.
 *
 * Everything here is pure, so the ordering rule can be tested without a database.
 */

import type { FolderSummary, LocalPlaylist, LocalTrack } from "@/lib/db/types";
import type { HistoryItem } from "@/lib/history";

/**
 * One row of the Recent tab.
 *
 * A union rather than a shape with three optional fields, because each branch
 * renders as a genuinely different card: a folder has progress to show, a
 * playlist has a track list to play, and a bare track has neither.
 */
export type RecentPlay =
  | { kind: "folder"; folder: FolderSummary; lastPlayedAt: number }
  | { kind: "playlist"; playlist: LocalPlaylist; lastPlayedAt: number }
  | { kind: "track"; track: LocalTrack; lastPlayedAt: number };

/** Stable identity of a recent row, for dedupe and for React keys. */
export function recentPlayKey(play: RecentPlay): string {
  switch (play.kind) {
    case "folder":
      return `folder:${play.folder.key}`;
    case "playlist":
      return `playlist:${play.playlist.id}`;
    case "track":
      return `track:${play.track.id}`;
  }
}

export type BuildRecentPlaysInput = {
  /** Newest first, as `getSessionsForHistory` returns them. */
  items: readonly HistoryItem[];
  folders: readonly FolderSummary[];
  playlists: readonly LocalPlaylist[];
  tracks: readonly LocalTrack[];
  limit: number;
};

/**
 * Collapses recent sessions into distinct recent plays.
 *
 * A session that belonged to a collection becomes that collection. A session
 * whose collection has since been emptied or deleted falls through to its track
 * instead of being dropped: the listener really did hear that file, it is still
 * in the library, and hiding it because the folder around it disappeared would
 * lose the only remaining pointer to it.
 */
export function buildRecentPlays({
  items,
  folders,
  playlists,
  tracks,
  limit,
}: BuildRecentPlaysInput): RecentPlay[] {
  const folderByKey = new Map(folders.map((folder) => [folder.key, folder]));
  const playlistById = new Map(playlists.map((playlist) => [playlist.id, playlist]));
  const trackById = new Map(tracks.map((track) => [track.id, track]));

  const seen = new Set<string>();
  const plays: RecentPlay[] = [];

  for (const item of items) {
    if (plays.length >= limit) {
      break;
    }
    const { session } = item;
    const lastPlayedAt = session.startedAt;

    if (session.contextType === "folder" && session.contextKey !== null) {
      const folder = folderByKey.get(session.contextKey);
      if (folder) {
        if (!seen.has(`folder:${folder.key}`)) {
          seen.add(`folder:${folder.key}`);
          plays.push({ kind: "folder", folder, lastPlayedAt });
        }
        continue;
      }
    } else if (session.contextType === "playlist" && session.contextKey !== null) {
      const playlist = playlistById.get(session.contextKey);
      if (playlist) {
        if (!seen.has(`playlist:${playlist.id}`)) {
          seen.add(`playlist:${playlist.id}`);
          plays.push({ kind: "playlist", playlist, lastPlayedAt });
        }
        continue;
      }
    }

    const track = trackById.get(session.trackId);
    if (!track || seen.has(`track:${track.id}`)) {
      continue;
    }
    seen.add(`track:${track.id}`);
    plays.push({ kind: "track", track, lastPlayedAt });
  }

  return plays;
}

/**
 * How long ago something was played, in the shortest form that is still true.
 *
 * Days rather than calendar dates for the first week, because "3d ago" is what
 * the reader is actually asking; past that a date is both shorter to scan and
 * unambiguous about *which* day.
 */
export function describeRecentWhen(timestampMs: number, now: number = Date.now()): string {
  const deltaSec = Math.floor((now - timestampMs) / 1000);
  if (deltaSec < 60) {
    return "Just now";
  }
  const minutes = Math.floor(deltaSec / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  return new Date(timestampMs).toLocaleDateString();
}
