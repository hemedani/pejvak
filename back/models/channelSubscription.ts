import { coreApp } from "../mod.ts";
import { type RelationDataType, type RelationSortOrderType } from "lesan";
import { createUpdateAt } from "../utils/createUpdateAt.ts";
import { channel_excludes, subscriber_excludes } from "./excludes.ts";

/**
 * A listener's follow of one channel.
 *
 * This is a **join model**, not a direct many-to-many on `User`. Lesan stores
 * relations as denormalised snapshots and `$slice`s a `multiple` relation down
 * to its configured `limit`; its own `removeRelation` warns that one side of a
 * many-to-many must be unlimited or references are lost. A join row keeps both
 * documents bounded, carries a real `createdAt` (the subscribe time), and the
 * unique `{ channel, user }` index makes a replayed subscribe atomic instead of
 * a read-check-then-add race.
 *
 * The forward relations embed the channel and subscriber snapshots. The
 * reverse arrays are intentionally left unpopulated (every insert passes
 * `relatedRelations: {}`): `channelSubscription` itself is the source of truth,
 * so a subscriber list is a query on this collection rather than a cached array
 * that can go stale or exceed Mongo's 16 MB document cap.
 */
export const channelSubscription_pure = {
  ...createUpdateAt,
};

export const channelSubscription_relations = {
  channel: {
    schemaName: "channel",
    type: "single" as RelationDataType,
    optional: false,
    excludes: channel_excludes,
    relatedRelations: {
      subscriptions: {
        type: "multiple" as RelationDataType,
        // First-page embed only, like every other reverse relation. The
        // authoritative list is queried from this collection directly.
        limit: 50,
        sort: {
          field: "createdAt",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
  user: {
    schemaName: "user",
    type: "single" as RelationDataType,
    optional: false,
    excludes: subscriber_excludes,
    relatedRelations: {
      channelSubscriptions: {
        type: "multiple" as RelationDataType,
        limit: 50,
        sort: {
          field: "createdAt",
          order: "desc" as RelationSortOrderType,
        },
      },
    },
  },
};

export const channelSubscriptions = () =>
  coreApp.odm.newModel(
    "channelSubscription",
    channelSubscription_pure,
    channelSubscription_relations,
    {
      createIndex: {
        // One row per listener per channel; the unique index is what makes a
        // replayed subscribe idempotent even when two requests race.
        indexSpec: { "channel._id": 1, "user._id": 1 },
        options: { unique: true },
      },
    },
  );
