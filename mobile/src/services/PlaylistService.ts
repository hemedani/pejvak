import {
  addTracksToPlaylist,
  movePlaylistItem,
  removeTracksFromPlaylist,
  resolvePlaylistTracks,
} from "@/lib/playlists";
import type { ContextStats, LocalPlaylist, LocalTrack } from "@/lib/db/types";
import type { PlaybackContext } from "@/lib/playbackContext";
import { LocalDBService } from "@/services/LocalDBService";
import * as TrackPlayerService from "@/services/TrackPlayerService";

export type PlaylistDetailData = {
  playlist: LocalPlaylist;
  /** Playlist items resolved to library tracks, in order. */
  tracks: LocalTrack[];
  /** All library tracks, for the add-track picker. */
  library: LocalTrack[];
  /** How often the playlist has been played *as a collection*, and how often through. */
  stats: ContextStats;
};

function requireTitle(title: string): string {
  const trimmed = title.trim();
  if (!trimmed) {
    throw new Error("Playlist title is required");
  }
  return trimmed;
}

function list(): Promise<LocalPlaylist[]> {
  return LocalDBService.getPlaylists();
}

function get(id: string): Promise<LocalPlaylist | null> {
  return LocalDBService.getPlaylistById(id);
}

async function loadDetail(id: string): Promise<PlaylistDetailData | null> {
  const [playlist, library] = await Promise.all([
    LocalDBService.getPlaylistById(id),
    LocalDBService.getAllTracks(),
  ]);
  if (!playlist) {
    return null;
  }
  return {
    playlist,
    library,
    tracks: resolvePlaylistTracks(playlist.items, library),
    stats: await LocalDBService.getContextStats("playlist", playlist.id),
  };
}

/**
 * The collection a playlist's queue belongs to.
 *
 * `key` is the local playlist id, which is what a run's resume path resolves
 * back to a queue; the title rides along so the player can name the collection
 * without a query — and is captured into the run at play time, so renaming the
 * playlist later cannot rewrite what the listener heard.
 */
function contextFor(playlist: Pick<LocalPlaylist, "id" | "title">): PlaybackContext {
  return { type: "playlist", key: playlist.id, title: playlist.title };
}

/**
 * `async` on purpose, even though the body just forwards a promise: a blank
 * title has to arrive as a rejected promise, not a synchronous throw. A function
 * declared `: Promise<LocalPlaylist>` that throws before returning breaks
 * `PlaylistService.create(x).catch(...)` at the call site.
 */
async function create(title: string): Promise<LocalPlaylist> {
  return LocalDBService.insertPlaylist({ title: requireTitle(title) });
}

async function rename(id: string, title: string): Promise<void> {
  await LocalDBService.updatePlaylist(id, { title: requireTitle(title) });
}

function remove(id: string): Promise<void> {
  return LocalDBService.softDeletePlaylist(id);
}

/**
 * Adds several tracks with a single playlist write.
 *
 * The playlist is read once and written once, so adding a 200-file folder costs
 * one query and one update rather than 200 of each.
 */
async function addTracks(id: string, trackIds: readonly string[]): Promise<void> {
  const playlist = await LocalDBService.getPlaylistById(id);
  if (!playlist) {
    return;
  }
  await LocalDBService.updatePlaylist(id, {
    items: addTracksToPlaylist(playlist.items, trackIds),
  });
}

async function removeTracks(id: string, trackIds: readonly string[]): Promise<void> {
  const playlist = await LocalDBService.getPlaylistById(id);
  if (!playlist) {
    return;
  }
  await LocalDBService.updatePlaylist(id, {
    items: removeTracksFromPlaylist(playlist.items, trackIds),
  });
}

async function addTrack(id: string, trackId: string): Promise<void> {
  await addTracks(id, [trackId]);
}

async function removeTrack(id: string, trackId: string): Promise<void> {
  await removeTracks(id, [trackId]);
}

/**
 * Creates a playlist that already holds the given tracks.
 *
 * One insert rather than create-then-add: the picker's "new playlist" row has to
 * feel like a single gesture, and a half-created playlist would be visible to the
 * sync engine if the second write never landed.
 *
 * `async` for the same reason as `create` — a blank title must reject, not throw.
 */
async function createWithTracks(
  title: string,
  trackIds: readonly string[],
): Promise<LocalPlaylist> {
  return LocalDBService.insertPlaylist({
    title: requireTitle(title),
    items: addTracksToPlaylist([], trackIds),
  });
}

async function moveTrack(id: string, from: number, to: number): Promise<void> {
  const playlist = await LocalDBService.getPlaylistById(id);
  if (!playlist) {
    return;
  }
  await LocalDBService.updatePlaylist(id, {
    items: movePlaylistItem(playlist.items, from, to),
  });
}

/**
 * Starts a playlist at `index`, as a collection.
 *
 * The whole playlist becomes the queue — so the next track after the one tapped
 * is the next item rather than the end of playback — and the queue carries a
 * playlist context, which is what gives the playlist a listening history and
 * lets the player offer to open it. Returns the entry track id, or null when
 * the playlist is empty or gone.
 */
async function play(id: string, index = 0): Promise<string | null> {
  const detail = await loadDetail(id);
  if (!detail) {
    return null;
  }
  const queueIds = detail.tracks.map((track) => track.id);
  const entryId = queueIds[index];
  if (!entryId) {
    return null;
  }
  await TrackPlayerService.playQueueAt(
    queueIds,
    index,
    undefined,
    contextFor(detail.playlist),
  );
  return entryId;
}

/**
 * Local-first playlist management. Playlists live in SQLite and sync through
 * `SyncService` (items are sent by `contentHash` and resolved to server ids
 * server-side); deletes are tombstoned locally and pushed by `clientId`.
 *
 * Composed from module functions rather than written as methods, so
 * `const { addTracks } = PlaylistService` keeps working.
 */
export const PlaylistService = {
  list,
  get,
  loadDetail,
  contextFor,
  create,
  rename,
  remove,
  addTrack,
  addTracks,
  removeTrack,
  removeTracks,
  createWithTracks,
  moveTrack,
  play,
};
