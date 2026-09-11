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
import { session_excludes, track_excludes, user_excludes } from "./excludes.ts";

export const annotation_pure = {
  clientId: optional(string()),
  positionSec: number(),
  text: string(),
  tags: defaulted(array(string()), []),
  color: optional(string()),
  timesPlayedBefore: defaulted(number(), 0),
  ...createUpdateAt,
};

export const annotation_relations = {
  track: {
    schemaName: "track",
    type: "single" as RelationDataType,
    optional: false,
    excludes: track_excludes,
    relatedRelations: {
      annotations: {
        type: "multiple" as RelationDataType,
        limit: 1000,
        sort: {
          field: "positionSec",
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
      annotations: {
        type: "multiple" as RelationDataType,
        limit: 50,
        sort: {
          field: "_id",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
  session: {
    schemaName: "playbackSession",
    type: "single" as RelationDataType,
    optional: true,
    excludes: session_excludes,
    relatedRelations: {},
  },
};

export const annotations = () =>
  coreApp.odm.newModel("annotation", annotation_pure, annotation_relations, {
    createIndex: {
      indexSpec: { clientId: 1 },
      options: { unique: true, sparse: true },
    },
  });
