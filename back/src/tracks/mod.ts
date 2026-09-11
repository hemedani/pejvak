import { getMyTracksSetup } from "./getMyTracks/mod.ts";
import { registerTrackSetup } from "./registerTrack/mod.ts";

export const tracksSetup = () => {
  registerTrackSetup();
  getMyTracksSetup();
};
