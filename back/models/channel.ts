import { coreApp } from "../mod.ts";
import {
  array,
  defaulted,
  enums,
  number,
  object,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { user_excludes } from "./excludes.ts";

/**
 * A creator's public shelf of user-made audio.
 *
 * A `channel` is the unit of public discovery for the Listener Channels feature:
 * a listener creates one, and uploads the podcasts and audiobooks they produced
 * into it. Everything here is **public and free by construction** — there is no
 * `isPublic` field, because a boolean that can only ever be `true` is a
 * placeholder that invites a future bug, and the absence itself encodes the
 * rule (prompt D2). There is no price and no entitlement gate on reading a
 * channel; the only meter is the creator's hosting quota (plan §6).
 *
 * This is deliberately **not** the personal `playlist` model and **not** an
 * `onlineCollection`:
 *
 * - `onlineCollection` stores only an *address* because a third party signs the
 *   media URLs; the bytes live on the source's CDN.
 * - `playlist` is the listener's own, device-synced grouping of *their* tracks.
 * - `channel` groups `channelPlaylist` folders that group `channelAudio` rows
 *   whose bytes **we host and serve**. That is the whole difference (prompt D1).
 *
 * `slug` is the shareable, rename-stable public address (`/c/<slug>`). The
 * `createChannel` act derives it from `name` and de-duplicates it; the client
 * never sends it, and `updateChannel` never edits it, so a renamed channel keeps
 * its old links working.
 *
 * `status` exists only for moderation (plan §3d): an operator `removed` hides the
 * channel from every public read without destroying bytes or history, and is
 * distinct from a creator's own hard delete.
 *
 * `audioCount`/`playlistCount` are **informational** counters maintained by the
 * child acts for fast cards — never a second source of truth that can lie (root
 * AGENTS: a derived fact is not authoritative).
 */
export const channel_pure = {
  /** Unique, URL-safe, derived from `name`; stable across renames. */
  slug: string(),
  name: string(),
  /** Long "about" text. */
  bio: optional(string()),
  /**
   * At least one category (prompt D5). The minimum is enforced in the act, not
   * by Superstruct, so the catalogue stays in the clients and an unknown slug is
   * never rejected on read.
   */
  categories: array(string()),
  /** Primary content language; client catalogue, unvalidated. */
  languageCode: optional(string()),
  avatarUrl: optional(string()),
  /** Extra showcase images (URLs), embedded like `playlist.items`. */
  gallery: defaulted(array(string()), []),
  /** Out-link to the creator's own donation page — Pejvak never touches it. */
  donationUrl: optional(string()),
  websiteUrl: optional(string()),
  socials: defaulted(
    array(object({ platform: string(), url: string() })),
    [],
  ),
  /** "and etc." — a way to reach the creator. */
  contactEmail: optional(string()),
  /** Moderation switch (plan §3d). A removed channel is hidden, not deleted. */
  status: defaulted(enums(["active", "removed"]), "active"),
  /** Informational, maintained by the audio acts. */
  audioCount: defaulted(number(), 0),
  /** Informational, maintained by the playlist acts. */
  playlistCount: defaulted(number(), 0),
  /** Informational, maintained by the subscription acts. */
  subscriberCount: defaulted(number(), 0),
  ...createUpdateAt,
};

export const channel_relations = {
  /**
   * The creator who owns the channel. Named `owner` rather than `user` so a
   * reader cannot confuse it with a subscriber, who is also a `user`.
   */
  owner: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      ownedChannels: {
        type: "multiple" as RelationDataType,
        limit: 20,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
};

export const channels = () =>
  coreApp.odm.newModel("channel", channel_pure, channel_relations, {
    createIndex: {
      // The model factory takes exactly one index; the secondaries live in
      // `src/db/indexes.ts`. `slug` is the one that must be unique.
      indexSpec: { slug: 1 },
      options: { unique: true },
    },
  });
