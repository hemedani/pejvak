import { getMyTracksSetup } from "./getMyTracks/mod.ts";
import { getTrackDetailSetup } from "./getTrackDetail/mod.ts";
import { registerTrackSetup } from "./registerTrack/mod.ts";

export const tracksSetup = () => {
  registerTrackSetup();
  getMyTracksSetup();
  getTrackDetailSetup();
};
