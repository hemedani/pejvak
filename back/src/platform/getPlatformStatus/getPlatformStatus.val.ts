import { enums, object, optional } from "lesan";

/**
 * The full platform row, projected by `get`.
 *
 * This is now the single read for BOTH the anonymous client (which asks for the
 * four switches) and the operator panel (which also asks for `key`) — the old
 * `adminGetPlatformSetting` was a duplicate of this exact read on the same row,
 * so it was collapsed here (prompt D15: one act per operation when the shape is
 * the same). Nothing here is secret; the row is the same for every caller.
 */
export const getPlatformStatusValidator = () =>
  object({
    set: object({}),
    get: optional(
      object({
        key: optional(enums([0, 1])),
        signupsEnabled: optional(enums([0, 1])),
        aiEnabled: optional(enums([0, 1])),
        maintenanceMode: optional(enums([0, 1])),
        announcement: optional(enums([0, 1])),
      }),
    ),
  });
