import { authSetup } from "./auth/mod.ts";
import { syncSetup } from "./sync/mod.ts";
import { tracksSetup } from "./tracks/mod.ts";

export const functionsSetup = () => {
  authSetup();
  tracksSetup();
  syncSetup();
};
