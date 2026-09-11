import { coreApp } from "../mod.ts";
import {
  array,
  boolean,
  defaulted,
  number,
  object,
  objectIdValidation,
  optional,
  type RelationDataType,
  type RelationSortOrderType,
  string,
} from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { user_excludes } from "./excludes.ts";

export const playlist_pure = {
  title: string(),
  description: optional(string()),
  isPublic: defaulted(boolean(), false),
  items: defaulted(
    array(object({ trackId: objectIdValidation, order: number() })),
    [],
  ),
  ...createUpdateAt,
};

export const playlist_relations = {
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      playlists: {
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

export const playlists = () =>
  coreApp.odm.newModel("playlist", playlist_pure, playlist_relations);
