import { coreApp } from "../../mod.ts";

/**
 * Indexes the analytics and admin lists need.
 *
 * Lesan's `newModel` accepts one index, so the secondary ones are created here
 * from the raw collection handle. `createIndex` is idempotent, and none of
 * these change a document's shape — a restart on an existing database only
 * confirms them.
 */
export const ensureIndexes = async () => {
  const indexes: { collection: string; spec: Record<string, 1 | -1> }[] = [
    // History reads, retention and per-user quota counting.
    { collection: "playbackSession", spec: { "user._id": 1, startedAt: -1 } },
    // Platform-wide timeseries and active-user counts.
    { collection: "playbackSession", spec: { startedAt: -1 } },
    { collection: "track", spec: { "user._id": 1 } },
    { collection: "annotation", spec: { "user._id": 1 } },
    { collection: "playlist", spec: { "user._id": 1 } },
    { collection: "playbackContext", spec: { "user._id": 1, startedAt: -1 } },
    { collection: "onlineCollection", spec: { "user._id": 1 } },
    // Entitlement lookup on every sync.
    { collection: "subscription", spec: { "user._id": 1, status: 1 } },
    { collection: "billingTransaction", spec: { userId: 1, createdAt: -1 } },
    {
      collection: "adminAuditLog",
      spec: { targetType: 1, targetId: 1, createdAt: -1 },
    },
    { collection: "user", spec: { role: 1 } },
    { collection: "user", spec: { status: 1 } },
  ];

  for (const { collection, spec } of indexes) {
    await coreApp.odm.getCollection(collection).createIndex(spec);
  }
};
