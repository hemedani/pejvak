import { type ActFn, ObjectId } from "lesan";
import { coreApp, playlist } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

export const deletePlaylistFn: ActFn = async (body) => {
  const { set } = body.details;
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

  await playlist.deleteOne({ filter: { _id: existing!._id } });

  return { success: true };
};
