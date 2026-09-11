import { getMyListeningHistorySetup } from "./getMyListeningHistory/mod.ts";
import { getTrackSessionsSetup } from "./getTrackSessions/mod.ts";

export const sessionsSetup = () => {
  getMyListeningHistorySetup();
  getTrackSessionsSetup();
};
