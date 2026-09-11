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
import { track_excludes, user_excludes } from "./excludes.ts";

export const session_pure = {
  clientId: optional(string()),
  contentHash: optional(string()),
  startedAt: number(),
  endedAt: optional(number()),
  startPositionSec: defaulted(number(), 0),
  endPositionSec: defaulted(number(), 0),
  durationListenedSec: defaulted(number(), 0),
  playbackSpeed: defaulted(number(), 1),
  completed: defaulted(boolean(), false),
  interrupted: defaulted(boolean(), false),
  deviceInfo: optional(string()),
  ...createUpdateAt,
};

export const session_relations = {
  track: {
    schemaName: "track",
    type: "single" as RelationDataType,
    optional: false,
    excludes: track_excludes,
    relatedRelations: {
      sessions: {
        type: "multiple" as RelationDataType,
        limit: 50,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
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
      sessions: {
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

export const playbackSessions = () =>
  coreApp.odm.newModel("playbackSession", session_pure, session_relations, {
    createIndex: {
      indexSpec: { clientId: 1 },
      options: { unique: true, sparse: true },
    },
  });
