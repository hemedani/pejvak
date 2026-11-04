import { coreApp } from "../mod.ts";
import { boolean, defaulted, optional, string } from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";

/**
 * The platform's global switches — one document, key `platform`.
 *
 * Deliberately not a bag of limits: a limit belongs to a `plan`, because it is
 * sold, and duplicating it here would create two answers to "how much history
 * does a free listener get?". What lives here is the small set of things that
 * are not sold and not per-user:
 *
 * - `signupsEnabled` — closes registration during an incident without a deploy.
 *   Enforced by the register act, which refuses with a message rather than
 *   silently creating an account.
 * - `aiEnabled` — the switch the AI features will be sold behind later. The
 *   plan says how many credits an account bought; this says whether the feature
 *   exists yet, and `getMyAiUsage` reports both.
 * - `maintenanceMode` — a client signal, not a server interlock: the server
 *   keeps serving reads and the panel, because the operator who ends the
 *   maintenance is using the panel. Clients read it from `getPlatformStatus`.
 * - `announcement` — one line of copy, no deploy.
 *
 * The row is created on first read (`readPlatformSetting`) so a fresh database
 * never fails a request, and an admin edit is never overwritten by a default.
 * `getPlatformStatus` exposes the four fields anonymously; nothing per-user or
 * per-plan is in this document, so that read leaks nothing.
 */
export const platformSetting_pure = {
  /** Singleton key. Always `platform`; exists so the schema has an identity. */
  key: string(),
  signupsEnabled: defaulted(boolean(), true),
  aiEnabled: defaulted(boolean(), false),
  maintenanceMode: defaulted(boolean(), false),
  announcement: optional(string()),
  ...createUpdateAt,
};

export const platformSetting_relations = {};

export const platformSettings = () =>
  coreApp.odm.newModel(
    "platformSetting",
    platformSetting_pure,
    platformSetting_relations,
    {
      createIndex: {
        indexSpec: { key: 1 },
        options: { unique: true },
      },
    },
  );
