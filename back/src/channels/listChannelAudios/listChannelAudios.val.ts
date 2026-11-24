import { enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

/**
 * Episodes in a channel and/or a folder (prompt D15: creator, listener, operator).
 *
 * Scoped to a `channelId` and/or a `playlistId` (at least one), then narrowed by
 * `category`, `tag` and a `title`/`description`/`author` search. `status` is
 * honoured only for an operator; everyone else is pinned to `active`.
 */
export const listChannelAudiosValidator = () =>
  object({
    set: object({
      channelId: optional(string()),
      playlistId: optional(string()),
      category: optional(string()),
      tag: optional(string()),
      q: optional(string()),
      status: optional(enums(["active", "removed"])),
      ...pagination,
    }),
    get: selectStruct("channelAudio", 1),
  });
