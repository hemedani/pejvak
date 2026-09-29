import { type ActFn, ObjectId } from "lesan";
import { coreApp, onlineCollection } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const saveOnlineCollectionFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  // Derived, never accepted from the client. This key is also the run's
  // `contextKey`, so a client that could choose it could write a collection its
  // own listening history would never find again.
  const clientId = `${set.sourceId}:${set.externalId}`;

  const existing = await onlineCollection.findOne({
    filters: { clientId, "user._id": userId },
    projection: { _id: 1, updatedAt: 1 },
  });

  // A tombstone from the device: the collection is gone from the listener's
  // shelf, so the server row goes too rather than lingering as a favourite.
  if (set.deleted) {
    if (existing) {
      await onlineCollection.deleteOne({ filter: { _id: existing._id } });
    }
    return null;
  }

  const incomingUpdatedAt = set.updatedAt ?? Date.now();

  if (existing) {
    const existingUpdatedAt = existing.updatedAt
      ? new Date(existing.updatedAt).getTime()
      : 0;

    // Last-write-wins. A push that is not newer is acknowledged by returning
    // the row as it stands — the client still needs its server id.
    if (incomingUpdatedAt > existingUpdatedAt) {
      await onlineCollection.findOneAndUpdate({
        filter: { _id: existing._id },
        update: {
          $set: {
            title: set.title,
            languageCode: set.languageCode,
            trackCount: set.trackCount,
            ...(set.subtitle !== undefined ? { subtitle: set.subtitle } : {}),
            ...(set.artworkUrl !== undefined
              ? { artworkUrl: set.artworkUrl }
              : {}),
            ...(set.pageUrl !== undefined ? { pageUrl: set.pageUrl } : {}),
            ...(set.isFavorite !== undefined
              ? { isFavorite: set.isFavorite }
              : {}),
            ...(set.lastOpenedAt !== undefined
              ? { lastOpenedAt: set.lastOpenedAt }
              : {}),
            updatedAt: new Date(incomingUpdatedAt),
          },
        },
        projection: { _id: 1 },
      });
    }

    return await onlineCollection.findOne({
      filters: { _id: existing._id },
      projection: get,
    });
  }

  const inserted = await onlineCollection.insertOne({
    doc: {
      clientId,
      sourceId: set.sourceId,
      externalId: set.externalId,
      title: set.title,
      languageCode: set.languageCode,
      subtitle: set.subtitle,
      artworkUrl: set.artworkUrl,
      trackCount: set.trackCount,
      pageUrl: set.pageUrl,
      isFavorite: set.isFavorite ?? false,
      lastOpenedAt: set.lastOpenedAt,
      updatedAt: new Date(incomingUpdatedAt),
    },
    relations: {
      user: {
        _ids: userId,
        relatedRelations: { onlineCollections: true },
      },
    } as never,
    projection: { _id: 1 },
  });

  if (!inserted) {
    throwError("Online collection was not saved");
  }

  return await onlineCollection.findOne({
    filters: { _id: inserted!._id },
    projection: get,
  });
};
