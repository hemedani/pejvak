import { type ActFn, ObjectId } from "lesan";
import {
  channel,
  channelAudio,
  channelPlaylist,
  coreApp,
} from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import { removeStoredBytes } from "../media.ts";

/**
 * Hard-deletes a folder and the episodes inside it, leaf-first (plan §3d).
 *
 * The audios go before the folder so no episode is orphaned, and their bytes are
 * unlinked best-effort. The parent channel's `playlistCount` is then decremented
 * — the channel id is read from the folder before it is deleted, so the count
 * bump cannot be lost to a dangling reference.
 */
export const deleteChannelPlaylistFn: ActFn = async (body) => {
  const { set } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const folderId = new ObjectId(set.playlistId);

  const folder = await channelPlaylist.findOne({
    filters: { _id: folderId, "user._id": new ObjectId(user._id) },
    projection: { _id: 1, "channel._id": 1 },
  });
  if (!folder) throwError("Folder not found");

  const audios = await channelAudio
    .aggregation({
      pipeline: [
        { $match: { "channelPlaylist._id": folderId } },
        { $project: { _id: 1, mediaPath: 1 } },
      ],
    })
    .toArray();

  for (const audio of audios) {
    await channelAudio.deleteOne({ filter: { _id: audio._id } });
  }
  await removeStoredBytes(audios.map((audio) => audio.mediaPath as string));

  await channelPlaylist.deleteOne({ filter: { _id: folderId } });

  const channelId = folder!.channel?._id as ObjectId | undefined;
  if (channelId) {
    await channel.findOneAndUpdate({
      filter: { _id: channelId },
      update: {
        $inc: { playlistCount: -1 },
        $set: { updatedAt: new Date() },
      } as never,
      projection: { _id: 1 },
    });
  }

  return { success: true };
};
