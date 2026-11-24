import { type ActFn, ObjectId } from "lesan";
import {
  channel,
  channelAudio,
  channelPlaylist,
  coreApp,
} from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import { recordAudit } from "../../admin/audit.ts";
import { removeStoredBytes } from "../media.ts";
import { actor, rowScope } from "../authz.ts";

/**
 * Hard-delete one episode — creator or operator (prompt D15).
 *
 * Scope is the caller's authority (owner → own row, admin → any). The row is
 * removed first (it is the authoritative half), bytes unlinked best-effort, and
 * the folder/channel counts decremented from the ids read before deletion. An
 * operator's delete is audited; a creator removing their own content is not.
 */
export const deleteChannelAudioFn: ActFn = async (body) => {
  const { set } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const who = actor();
  const audioId = new ObjectId(set.audioId);

  const audio = await channelAudio.findOne({
    filters: rowScope(who, audioId, { write: true }),
    projection: {
      _id: 1,
      title: 1,
      mediaPath: 1,
      "channel._id": 1,
      "channelPlaylist._id": 1,
      "user._id": 1,
    },
  });
  if (!audio) throwError("Audio not found");

  await channelAudio.deleteOne({ filter: { _id: audioId } });
  await removeStoredBytes([audio!.mediaPath as string | undefined]);

  const now = new Date();
  const folderId = audio!.channelPlaylist?._id as ObjectId | undefined;
  const channelId = audio!.channel?._id as ObjectId | undefined;

  if (folderId) {
    await channelPlaylist.findOneAndUpdate({
      filter: { _id: folderId },
      update: { $inc: { audioCount: -1 }, $set: { updatedAt: now } } as never,
      projection: { _id: 1 },
    });
  }
  if (channelId) {
    await channel.findOneAndUpdate({
      filter: { _id: channelId },
      update: { $inc: { audioCount: -1 }, $set: { updatedAt: now } } as never,
      projection: { _id: 1 },
    });
  }

  const isOwner = String(audio!.user?._id) === String(user._id);
  if (!isOwner) {
    await recordAudit({
      action: "channelAudio.delete",
      targetType: "channelAudio",
      targetId: String(audioId),
      summary: `Deleted channel audio ${audio!.title}`,
      metadata: { title: audio!.title, actor: String(user._id) },
    });
  }

  return { success: true };
};
