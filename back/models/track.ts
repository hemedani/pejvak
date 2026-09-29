import { coreApp } from "../mod.ts";
import {
  boolean,
  defaulted,
  number,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { user_excludes } from "./excludes.ts";

export const track_pure = {
  title: string(),
  contentHash: string(),
  fileName: optional(string()),
  durationSec: defaulted(number(), 0),
  fileSizeBytes: defaulted(number(), 0),
  mimeType: optional(string()),
  isAudiobook: defaulted(boolean(), false),
  author: optional(string()),
  narrator: optional(string()),
  artworkUrl: optional(string()),
  totalPlayCount: defaulted(number(), 0),
  totalListenTimeSec: defaulted(number(), 0),
  lastPlayedAt: optional(number()),
  /**
   * Where the audio comes from: a file the listener owns, or a stream from an
   * online source.
   *
   * Kept as `origin` rather than inferred from the absence of a local file,
   * because a downloaded course is *both* — the bytes are on the device and the
   * collection it came from is still online — and the two states have to stay
   * distinguishable after a rescan.
   */
  origin: defaulted(string(), "local"),
  /** Which source serves it (`manahej`). Absent for local audio. */
  sourceId: optional(string()),
  /**
   * The source's own id for this item.
   *
   * This, not the URL, is the stable half of an online track's identity: the
   * source signs its media URLs with an expiry, so the address is a cache of
   * how to reach the audio now and must be re-resolved before it is trusted.
   * The device never sends the URL here — see `models/onlineCollection.ts`.
   */
  externalId: optional(string()),
  /** The online collection it belongs to, as `sourceId:externalId`. */
  collectionKey: optional(string()),
  /** The collection's title, captured so a track can name its course offline. */
  collectionTitle: optional(string()),
  /** When the collection's audio was brought onto a device. */
  downloadedAt: optional(number()),
  ...createUpdateAt,
};

export const track_relations = {
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      tracks: {
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

export const tracks = () =>
  coreApp.odm.newModel("track", track_pure, track_relations, {
    createIndex: {
      indexSpec: { contentHash: 1 },
      options: {},
    },
  });
