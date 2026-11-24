import { type ActFn, ObjectId } from "lesan";
import {
  channel,
  channelAudio,
  channelPlaylist,
  coreApp,
} from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import {
  channelAudioQuotaOf,
  resolveEntitlement,
} from "../../entitlements/entitlement.ts";

/**
 * Creates an episode in a caller-owned folder.
 *
 * The channel is **derived** from the folder (prompt D8): the caller names the
 * folder, ownership of it is checked in-query, and the folder's embedded
 * `channel._id` becomes the audio's `channel` relation. A request can therefore
 * never file an episode into a channel the caller does not control.
 *
 * Two invariants make re-publish safe:
 *
 * - **Per-channel dedupe on `contentHash`**: a second upload of the same audio
 *   into the same channel returns the existing row rather than duplicating it,
 *   so a retried publish is idempotent.
 * - **Counts are bumped, not recomputed**: `playlist.audioCount` and
 *   `channel.audioCount` are informational (plan §3a) and moved with `$inc` only
 *   when a genuinely new row is created, so a dedupe never double-counts.
 */
export const publishChannelAudioFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);
  const folderId = new ObjectId(set.playlistId);

  const folder = await channelPlaylist.findOne({
    filters: { _id: folderId, "user._id": userId },
    projection: { _id: 1, "channel._id": 1, audioCount: 1 },
  });
  if (!folder) throwError("Folder not found");

  const channelId = folder!.channel?._id as ObjectId | undefined;
  if (!channelId) throwError("Folder has no channel");

  const entitlement = await resolveEntitlement(userId);
  if (entitlement.limits.channelAudios >= 0) {
    const quota = await channelAudioQuotaOf(userId, entitlement.limits);
    if (quota.remaining <= 0) {
      throwError(
        `Your plan publishes up to ${quota.limit} channel audios. Upgrade to add more.`,
      );
    }
  }

  // Idempotent re-publish: the same contentHash already in this channel wins.
  const duplicate = await channelAudio.findOne({
    filters: { contentHash: set.contentHash, "channel._id": channelId },
    projection: get,
  });
  if (duplicate) return duplicate;

  const now = new Date();
  const created = await channelAudio.insertOne({
    doc: {
      contentHash: set.contentHash,
      title: set.title,
      category: set.category,
      audioUrl: set.audioUrl,
      mediaPath: set.mediaPath,
      description: set.description,
      tags: set.tags ?? [],
      durationSec: set.durationSec ?? 0,
      fileSizeBytes: set.fileSizeBytes ?? 0,
      mimeType: set.mimeType,
      isAudiobook: set.isAudiobook ?? false,
      author: set.author,
      narrator: set.narrator,
      artworkUrl: set.artworkUrl,
      position: set.position ?? folder!.audioCount ?? 0,
      languageCode: set.languageCode,
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    relations: {
      channel: { _ids: channelId, relatedRelations: {} },
      channelPlaylist: { _ids: folderId, relatedRelations: {} },
      user: { _ids: userId, relatedRelations: {} },
    } as never,
    projection: { _id: 1 },
  });
  if (!created) throwError("Audio was not published");

  await channelPlaylist.findOneAndUpdate({
    filter: { _id: folderId },
    update: { $inc: { audioCount: 1 }, $set: { updatedAt: now } } as never,
    projection: { _id: 1 },
  });
  await channel.findOneAndUpdate({
    filter: { _id: channelId },
    update: { $inc: { audioCount: 1 }, $set: { updatedAt: now } } as never,
    projection: { _id: 1 },
  });

  return await channelAudio.findOne({
    filters: { _id: created!._id },
    projection: get,
  });
};
