import { type ActFn, ObjectId } from "lesan";
import { channel, channelPlaylist, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

/**
 * Creates a folder inside a channel the caller owns.
 *
 * The channel is verified by ownership in the lookup (`"user._id": userId`), so
 * a token can never file a folder into someone else's channel. `sortOrder`
 * defaults to the channel's current folder count, which appends the new folder
 * to the end without a read-modify-write race on an explicit value.
 */
export const createChannelPlaylistFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);
  const channelId = new ObjectId(set.channelId);

  const channelRow = await channel.findOne({
    filters: { _id: channelId, "user._id": userId },
    projection: { _id: 1, playlistCount: 1 },
  });
  if (!channelRow) throwError("Channel not found");

  const now = new Date();
  const created = await channelPlaylist.insertOne({
    doc: {
      title: set.title,
      category: set.category,
      description: set.description,
      tags: set.tags ?? [],
      sortOrder: set.sortOrder ?? channelRow!.playlistCount ?? 0,
      audioCount: 0,
      createdAt: now,
      updatedAt: now,
    },
    relations: {
      channel: { _ids: channelId, relatedRelations: {} },
      user: { _ids: userId, relatedRelations: {} },
    } as never,
    projection: { _id: 1 },
  });
  if (!created) throwError("Folder was not created");

  // Informational count, maintained by the folder acts (plan §3a).
  await channel.findOneAndUpdate({
    filter: { _id: channelId },
    update: {
      $inc: { playlistCount: 1 },
      $set: { updatedAt: now },
    } as never,
    projection: { _id: 1 },
  });

  return await channelPlaylist.findOne({
    filters: { _id: created!._id },
    projection: get,
  });
};
