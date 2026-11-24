import { type ActFn, ObjectId } from "lesan";
import { channelPlaylist, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

/**
 * Patches a folder the caller owns.
 *
 * Ownership is checked on the folder's own `user._id` rather than by walking up
 * to the channel — the reason the folder carries `user` at all (plan §3b).
 * `category` stays a single required slug when sent; an empty one would leave
 * the folder unclassifiable, so it is refused.
 */
export const updateChannelPlaylistFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;

  const existing = await channelPlaylist.findOne({
    filters: {
      _id: new ObjectId(set.playlistId),
      "user._id": new ObjectId(user._id),
    },
    projection: { _id: 1 },
  });
  if (!existing) throwError("Folder not found");

  if (set.category !== undefined && set.category.trim() === "") {
    throwError("A folder needs a category");
  }

  const editable = [
    "title",
    "description",
    "category",
    "tags",
    "sortOrder",
  ] as const;
  const fields: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of editable) {
    const value = set[key];
    if (value !== undefined) fields[key] = value;
  }

  await channelPlaylist.findOneAndUpdate({
    filter: { _id: existing!._id },
    update: { $set: fields } as never,
    projection: { _id: 1 },
  });

  return await channelPlaylist.findOne({
    filters: { _id: existing!._id },
    projection: get,
  });
};
