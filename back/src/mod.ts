import { annotationsSetup } from "./annotations/mod.ts";
import { authSetup } from "./auth/mod.ts";
import { contextsSetup } from "./contexts/mod.ts";
import { playlistsSetup } from "./playlists/mod.ts";
import { sessionsSetup } from "./sessions/mod.ts";
import { statsSetup } from "./stats/mod.ts";
import { syncSetup } from "./sync/mod.ts";
import { tracksSetup } from "./tracks/mod.ts";

export const functionsSetup = () => {
  authSetup();
  tracksSetup();
  syncSetup();
  annotationsSetup();
  sessionsSetup();
  statsSetup();
  playlistsSetup();
  contextsSetup();
};
