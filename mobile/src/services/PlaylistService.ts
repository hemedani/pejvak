import {
  addTrackToPlaylist,
  movePlaylistItem,
  removeTrackFromPlaylist,
  resolvePlaylistTracks,
} from "@/lib/playlists";
import type { LocalPlaylist, LocalTrack } from "@/lib/db/types";
import { LocalDBService } from "@/services/LocalDBService";

export type PlaylistDetailData = {
  playlist: LocalPlaylist;
  /** Playlist items resolved to library tracks, in order. */
  tracks: LocalTrack[];
  /** All library tracks, for the add-track picker. */
  library: LocalTrack[];
};

/**
 * Local-first playlist management. Playlists live in SQLite and sync through
 * `SyncService` (items are sent by `contentHash` and resolved to server ids
 * server-side); deletes are tombstoned locally and pushed by `clientId`.
 */
export const PlaylistService = {
  list: () => LocalDBService.getPlaylists(),

  get: (id: string) => LocalDBService.getPlaylistById(id),

  async loadDetail(id: string): Promise<PlaylistDetailData | null> {
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
    };
  },

  async create(title: string) {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error("Playlist title is required");
    }
    return LocalDBService.insertPlaylist({ title: trimmed });
  },

  async rename(id: string, title: string): Promise<void> {
    const trimmed = title.trim();
    if (!trimmed) {
      throw new Error("Playlist title is required");
    }
    await LocalDBService.updatePlaylist(id, { title: trimmed });
  },

  remove: (id: string) => LocalDBService.softDeletePlaylist(id),

  async addTrack(id: string, trackId: string): Promise<void> {
    const playlist = await LocalDBService.getPlaylistById(id);
    if (!playlist) {
      return;
    }
    await LocalDBService.updatePlaylist(id, {
      items: addTrackToPlaylist(playlist.items, trackId),
    });
  },

  async removeTrack(id: string, trackId: string): Promise<void> {
    const playlist = await LocalDBService.getPlaylistById(id);
    if (!playlist) {
      return;
    }
    await LocalDBService.updatePlaylist(id, {
      items: removeTrackFromPlaylist(playlist.items, trackId),
    });
  },

  async moveTrack(id: string, from: number, to: number): Promise<void> {
    const playlist = await LocalDBService.getPlaylistById(id);
    if (!playlist) {
      return;
    }
    await LocalDBService.updatePlaylist(id, {
      items: movePlaylistItem(playlist.items, from, to),
    });
  },
};
