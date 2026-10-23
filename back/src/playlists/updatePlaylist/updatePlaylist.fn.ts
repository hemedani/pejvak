import { type ActFn, ObjectId } from "lesan";
import { coreApp, playlist, track } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const updatePlaylistFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;

  const existing = await playlist.findOne({
    filters: {
      _id: new ObjectId(set.playlistId),
      "user._id": new ObjectId(user._id),
    },
    projection: { _id: 1 },
  });
  if (!existing) {
    throwError("Playlist not found");
  }

  if (set.items !== undefined) {
    const items = set.items as Array<{ trackId: string; order: number }>;
    const trackIds = [
      ...new Set(items.map((item) => String(item.trackId))),
    ].map((id) => new ObjectId(id));
    if (trackIds.length > 0) {
      const ownedTracks = await track.countDocument({
        filter: {
          _id: { $in: trackIds },
          "user._id": new ObjectId(user._id),
        },
      });
      if (ownedTracks !== trackIds.length) {
        throwError("Playlist contains a track you do not own");
      }
    }
  }

  await playlist.findOneAndUpdate({
    filter: { _id: existing!._id },
    update: {
      $set: {
        ...(set.title !== undefined ? { title: set.title } : {}),
        ...(set.description !== undefined
          ? { description: set.description }
          : {}),
        ...(set.isPublic !== undefined ? { isPublic: set.isPublic } : {}),
        ...(set.items !== undefined ? { items: set.items } : {}),
        updatedAt: new Date(),
      },
    },
    projection: { _id: 1 },
  });

  return await playlist.findOne({
    filters: { _id: existing!._id },
    projection: get,
  });
};
