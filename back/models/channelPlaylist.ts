import { coreApp } from "../mod.ts";
import {
  array,
  defaulted,
  number,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { channel_excludes, user_excludes } from "./excludes.ts";

/**
 * A **folder** inside one channel (prompt D3/D4).
 *
 * The owner's word was "the playlist almost acts like a folder for us," and the
 * model honours it literally: a `channelPlaylist` groups `channelAudio` rows, an
 * audio lives in exactly one folder, and a folder lives in exactly one channel.
 * That single containment is why this is **not** the personal `playlist` model —
 * the two share a concept-word and must not share a model, an act, or a table
 * (prompt D4). The personal `playlist` is private and references the listener's
 * own `track` ids; this is public and groups hosted `channelAudio` rows.
 *
 * Like the channel, a folder is **public and free by construction**: there is no
 * `isPublic` and no price. It carries no `status` of its own — visibility is the
 * channel's; a removed channel hides its folders, and a folder is never
 * individually taken down in v1.
 *
 * `category` is exactly one slug (prompt D5) and `tags` are several; both are
 * client catalogues, stored as sent and never validated against a server list.
 *
 * The `user` relation is **not** redundant with `channel.user`: it lets a
 * creator's folder be found, counted and purged without walking up to the
 * channel, and lets an act enforce ownership with one indexed filter — the same
 * reason `playbackSession` carries `user` even though it also carries `track`.
 */
export const channelPlaylist_pure = {
  title: string(),
  description: optional(string()),
  /** EXACTLY one category (required); client catalogue. */
  category: string(),
  tags: defaulted(array(string()), []),
  /** Manual order of folders within the channel. */
  sortOrder: defaulted(number(), 0),
  /** Informational, maintained by the audio acts. */
  audioCount: defaulted(number(), 0),
  ...createUpdateAt,
};

export const channelPlaylist_relations = {
  channel: {
    schemaName: "channel",
    type: "single" as RelationDataType,
    optional: false,
    excludes: channel_excludes,
    relatedRelations: {
      playlists: {
        type: "multiple" as RelationDataType,
        // Embedded reverse arrays are first-page only (deeper pages query the
        // child model directly), so a small cap is all the embed is ever for.
        limit: 50,
        sort: {
          field: "sortOrder",
          order: "asc" as RelationSortOrderType,
        },
      },
    },
  },
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      channelPlaylists: {
        type: "multiple" as RelationDataType,
        limit: 50,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
};

export const channelPlaylists = () =>
  coreApp.odm.newModel(
    "channelPlaylist",
    channelPlaylist_pure,
    channelPlaylist_relations,
    {
      createIndex: {
        indexSpec: { "channel._id": 1, sortOrder: 1 },
        options: {},
      },
    },
  );
