import { type ObjectId } from "lesan";
import { channel, channelAudio, channelPlaylist } from "../../mod.ts";
import { removeStoredBytes } from "./media.ts";

/**
 * Hard-deletes a channel and everything under it, leaf-first (plan §3d).
 *
 * Shared by the creator's `deleteChannel` (after it has checked ownership) and
 * the operator's `adminDeleteChannel` (which needs no ownership check). The
 * order is audios → folders → channel so no parent is removed while a child
 * still references it, and the audio bytes are unlinked best-effort.
 *
 * The caller is responsible for authorisation; this function only knows the
 * containment and the filesystem.
 */
export const hardDeleteChannel = async (channelId: ObjectId): Promise<void> => {
  const audios = await channelAudio
    .aggregation({
      pipeline: [
        { $match: { "channel._id": channelId } },
        { $project: { _id: 1, mediaPath: 1 } },
      ],
    })
    .toArray();

  for (const audio of audios) {
    await channelAudio.deleteOne({ filter: { _id: audio._id } });
  }
  await removeStoredBytes(audios.map((audio) => audio.mediaPath as string));

  const folders = await channelPlaylist
    .aggregation({
      pipeline: [
        { $match: { "channel._id": channelId } },
        { $project: { _id: 1 } },
      ],
    })
    .toArray();

  for (const folder of folders) {
    await channelPlaylist.deleteOne({ filter: { _id: folder._id } });
  }

  await channel.deleteOne({ filter: { _id: channelId } });
};
