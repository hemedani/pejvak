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

/**
 * An online collection the listener saved, favourited or downloaded.
 *
 * This is the server's copy of an *address*, never of media. The audio stays on
 * the source's own CDN and is fetched by the device; what is kept here is where
 * the collection lives and what the listener has done with it, so a second
 * device can show the same shelf of saved courses without having to re-discover
 * them.
 *
 * `clientId` is `sourceId:externalId` — the same string the device uses as its
 * primary key and as the run's `contextKey`. It is deliberately *not* unique:
 * two listeners who save the same public course share that key, so uniqueness is
 * per user and is enforced by the act's lookup, exactly as `syncLocalData`
 * enforces it for playlists and runs.
 *
 * `pageUrl` is the durable address. A `streamUrl` is not stored anywhere on the
 * server — the source signs its media URLs with an expiry, so a copy kept here
 * would be a link that fails opaquely weeks later on a device that trusted it.
 * The device re-resolves playable URLs from the source when it needs them.
 */
export const onlineCollection_pure = {
  /** `sourceId:externalId` — stable per collection, shared across users. */
  clientId: optional(string()),
  sourceId: string(),
  externalId: string(),
  title: string(),
  subtitle: optional(string()),
  artworkUrl: optional(string()),
  languageCode: string(),
  /** The size the source reported; informational, not a completion figure. */
  trackCount: defaulted(number(), 0),
  /** The collection's page on the source's site — the address to return to. */
  pageUrl: optional(string()),
  isFavorite: defaulted(boolean(), false),
  lastOpenedAt: optional(number()),
  /**
   * There is deliberately no `downloadedAt` here.
   *
   * Whether the audio is on a device is already recorded per track — every
   * `track` carries its own `downloadedAt` — so a flag on the collection would
   * be a second source of truth that could disagree with the tracks it
   * summarises. The same rule the project applies to play counts applies here:
   * a derived fact is not stored. What is kept is the address (`pageUrl`), which
   * is what lets the listener come back to the course at all.
   */
  /** Server-side tombstone, mirroring the device's `deletedAt`. */
  deletedAt: optional(number()),
  ...createUpdateAt,
};

export const onlineCollection_relations = {
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: user_excludes,
    relatedRelations: {
      onlineCollections: {
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

export const onlineCollections = () =>
  coreApp.odm.newModel(
    "onlineCollection",
    onlineCollection_pure,
    onlineCollection_relations,
    {
      createIndex: {
        // Not unique: the key is shared by every listener who saves the same
        // public collection, so uniqueness is per user and lives in the act.
        indexSpec: { clientId: 1 },
        options: {},
      },
    },
  );
