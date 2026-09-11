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
