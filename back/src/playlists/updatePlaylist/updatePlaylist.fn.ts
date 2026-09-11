import { type ActFn, ObjectId } from "lesan";
import { coreApp, playlist } from "../../../mod.ts";
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
