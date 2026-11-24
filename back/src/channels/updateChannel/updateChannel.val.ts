import { array, enums, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * Patching a channel — shared by creator and operator (prompt D15).
 *
 * Every content field is optional so the act is a partial update. `categories`,
 * when sent, must still be non-empty (prompt D5). `status` and `reason` are the
 * **operator-only** moderation switch — the data shape is validated here, but the
 * *permission* to send them is enforced in the fn (a creator is refused).
 * `slug`, `user` and the counts are never editable by anyone through this act.
 */
export const updateChannelValidator = () =>
  object({
    set: object({
      channelId: string(),
      name: optional(string()),
      bio: optional(string()),
      categories: optional(array(string())),
      languageCode: optional(string()),
      avatarUrl: optional(string()),
      gallery: optional(array(string())),
      donationUrl: optional(string()),
      websiteUrl: optional(string()),
      socials: optional(
        array(object({ platform: string(), url: string() })),
      ),
      contactEmail: optional(string()),
      status: optional(enums(["active", "removed"])),
      reason: optional(string()),
    }),
    get: selectStruct("channel", 1),
  });
