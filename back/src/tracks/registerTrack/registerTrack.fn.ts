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
