import { type ActFn, ObjectId } from "lesan";
import { coreApp, track } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const registerTrackFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);

  // `contentHash` is a file's identity across devices. Re-registering the same
  // file (e.g. from a second device) must return the existing track so history
  // and annotations follow the hash instead of splitting onto a duplicate.
  const existing = await track.findOne({
    filters: { contentHash: set.contentHash, "user._id": userId },
    projection: { _id: 1 },
  });

  if (existing) {
    // A track that is already known keeps its row, but its provenance may be
    // new information: the first registration happened while it was only being
    // streamed, and the download came later. These fields are facts about the
    // collection the item came from, so re-writing them is idempotent and
    // cannot lose a local edit — unlike the play counters, which are never
    // touched here.
    if (set.origin === "online") {
      await track.findOneAndUpdate({
        filter: { _id: existing._id },
        update: {
          $set: {
            origin: "online",
            ...(set.sourceId !== undefined ? { sourceId: set.sourceId } : {}),
            ...(set.externalId !== undefined
              ? { externalId: set.externalId }
              : {}),
            ...(set.collectionKey !== undefined
              ? { collectionKey: set.collectionKey }
              : {}),
            ...(set.collectionTitle !== undefined
              ? { collectionTitle: set.collectionTitle }
              : {}),
            ...(set.downloadedAt !== undefined
              ? { downloadedAt: set.downloadedAt }
              : {}),
            updatedAt: new Date(),
          },
        },
        projection: { _id: 1 },
      });
    }

    return await track.findOne({
      filters: { _id: existing._id },
      projection: get,
    });
  }

  const createdTrack = await track.insertOne({
    doc: set,
    relations: {
      user: {
        _ids: userId,
        relatedRelations: {},
      },
    } as never,
    projection: { _id: 1 },
  });

  if (!createdTrack) {
    throwError("Track was not created");
  }

  return await track.findOne({
    filters: { _id: createdTrack!._id },
    projection: get,
  });
};
