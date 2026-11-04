import type { ActFn } from "lesan";
import { pickByGet } from "@lib";
import { readPlatformSetting } from "../setting.ts";

/**
 * The four global switches, readable without a token.
 *
 * The admin acts can read the same row, but a client that is showing a
 * maintenance banner or hiding an AI button has no admin token — and it cannot
 * be asked to sign in to find out whether signing in is allowed. So this is the
 * one public read of the settings row.
 *
 * Nothing per-user lives here: limits and prices belong to a plan, and a plan
 * belongs to an account. What is returned is exactly the state that is the same
 * for every caller, which is why returning it anonymously leaks nothing.
 *
 * `maintenanceMode` is a signal, not an interlock. The server keeps serving
 * reads and the panel during maintenance on purpose: the operator who has to
 * turn it off is using the panel, and a server that refused writes would also
 * refuse the write that ends the maintenance.
 */
export const getPlatformStatusFn: ActFn = async (body) => {
  const setting = await readPlatformSetting();

  // An empty announcement is not an announcement. The admin act can only set a
  // string (there is no "clear" value), so a client would otherwise draw an
  // empty banner after an operator emptied the field.
  const announcement = setting.announcement?.trim();

  return pickByGet({
    signupsEnabled: setting.signupsEnabled,
    aiEnabled: setting.aiEnabled,
    maintenanceMode: setting.maintenanceMode,
    announcement: announcement ? setting.announcement : null,
  }, body.details.get);
};
