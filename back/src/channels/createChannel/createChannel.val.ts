import { array, object, optional, string } from "lesan";
import { selectStruct } from "../../../mod.ts";

/**
 * Creating a channel.
 *
 * The client sends the metadata it knows; it never sends `slug`, `status`,
 * `audioCount`, `playlistCount`, or the creator — the act derives the slug from
 * the name and seeds the rest. `categories` is required to be non-empty here
 * (prompt D5); the minimum is an act rule, not a Superstruct one, so the
 * catalogue itself stays in the clients.
 *
 * `socials` is an embedded array of `{ platform, url }` (prompt D6): a new
 * social platform is a new `platform` value, not a schema change, so the
 * `platform` string is intentionally not enumerated server-side.
 */
export const createChannelValidator = () =>
  object({
    set: object({
      name: string(),
      bio: optional(string()),
      categories: array(string()),
      languageCode: optional(string()),
      avatarUrl: optional(string()),
      gallery: optional(array(string())),
      donationUrl: optional(string()),
      websiteUrl: optional(string()),
      socials: optional(
        array(object({ platform: string(), url: string() })),
      ),
      contactEmail: optional(string()),
    }),
    get: selectStruct("channel", 1),
  });
