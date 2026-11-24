import { enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";
import { pagination } from "@lib";

/**
 * Browsing channels (prompt D15: creator, listener and operator share it).
 *
 * `category` is a client-catalogue slug matched against the embedded
 * `categories` array; `q` is a name/bio substring (escaped); `sort` is `new`
 * (createdAt) or `popular` (audioCount, until CH-AGG gives real play counts).
 * `status` is honoured only for an operator; everyone else is pinned to `active`.
 */
export const listChannelsValidator = () =>
  object({
    set: object({
      ...pagination,
      category: optional(string()),
      q: optional(string()),
      status: optional(enums(["active", "removed"])),
      sort: optional(enums(["new", "popular"])),
    }),
    get: selectStruct("channel", 1),
  });
