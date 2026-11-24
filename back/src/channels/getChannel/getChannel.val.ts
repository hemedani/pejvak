import { enums, number, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * One channel page, addressed by `slug` or `_id`.
 *
 * The `get` projects the **channel**; the folder list and the newest-audio slice
 * are computed columns merged in after the projection (the same shape admin list
 * acts use), so they are always returned and bounded server-side rather than
 * being an unbounded relation traversal the caller could abuse. `audioLimit`
 * caps the preview slice. `status` is honoured only for an operator (prompt D15);
 * everyone else is pinned to `active` by the fn.
 */
export const getChannelValidator = () =>
  object({
    set: object({
      slug: optional(string()),
      channelId: optional(string()),
      audioLimit: optional(number()),
      status: optional(enums(["active", "removed"])),
    }),
    get: selectStruct("channel", 1),
  });
