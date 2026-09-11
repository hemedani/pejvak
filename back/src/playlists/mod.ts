import { createPlaylistSetup } from "./createPlaylist/mod.ts";
import { deletePlaylistSetup } from "./deletePlaylist/mod.ts";
import { getMyPlaylistsSetup } from "./getMyPlaylists/mod.ts";
import { updatePlaylistSetup } from "./updatePlaylist/mod.ts";

export const playlistsSetup = () => {
  createPlaylistSetup();
  updatePlaylistSetup();
  deletePlaylistSetup();
  getMyPlaylistsSetup();
};
