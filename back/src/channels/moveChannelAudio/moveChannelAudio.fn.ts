import { type ActFn, ObjectId } from "lesan";
import { channelAudio, channelPlaylist, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";

/**
 * Re-files an episode into another folder of the **same** channel.
 *
 * The move is implemented as a delete-and-reinsert rather than an in-place
 * rewrite of the embedded `channel`/`channelPlaylist` sub-documents. That is a
 * deliberate choice: Lesan owns the shape of an embedded relation, and
 * hand-crafting those sub-documents is exactly the kind of "second source of
 * truth" the domain rules forbid. Re-inserting lets the framework re-derive the
 * embedding, and the re-derived `channel` comes from the destination folder, not
 * from the client (prompt D8).
 *
 * A consequence worth naming: the row's `_id` changes. Nothing references a
 * `channelAudio` by id — a listener's history and notes key on `contentHash`
 * (prompt D7) — so the move is invisible to everyone except the creator's own
 * list, which re-reads it anyway.
 *
 * The two folders' `audioCount` is adjusted; the channel's is not, because the
 * episode stayed inside the same channel.
 */
export const moveChannelAudioFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);
  const audioId = new ObjectId(set.audioId);
  const targetFolderId = new ObjectId(set.targetPlaylistId);

  const audio = await channelAudio.findOne({
    filters: { _id: audioId, "user._id": userId },
    projection: {
      _id: 1,
      contentHash: 1,
      title: 1,
      description: 1,
      category: 1,
      tags: 1,
      audioUrl: 1,
      mediaPath: 1,
      durationSec: 1,
      fileSizeBytes: 1,
      mimeType: 1,
      isAudiobook: 1,
      author: 1,
      narrator: 1,
      artworkUrl: 1,
      position: 1,
      languageCode: 1,
      status: 1,
      createdAt: 1,
      updatedAt: 1,
      "channel._id": 1,
      "channelPlaylist._id": 1,
    },
  });
  if (!audio) throwError("Audio not found");

  const src = audio!;
  const sourceFolderId = src.channelPlaylist?._id as ObjectId | undefined;
  const channelId = src.channel?._id as ObjectId | undefined;
  if (!channelId) throwError("Audio has no channel");

  const target = await channelPlaylist.findOne({
    filters: { _id: targetFolderId, "user._id": userId },
    projection: { _id: 1, "channel._id": 1, audioCount: 1 },
  });
  if (!target) throwError("Target folder not found");

  const targetChannelId = target!.channel?._id as ObjectId | undefined;
  if (String(targetChannelId) !== String(channelId)) {
    throwError("An audio can only move within its own channel");
  }

  if (sourceFolderId && String(sourceFolderId) === String(targetFolderId)) {
    // Already in the destination folder; only a position reorder is implied.
    const position = set.position ?? src.position ?? 0;
    await channelAudio.findOneAndUpdate({
      filter: { _id: audioId },
      update: { $set: { position, updatedAt: new Date() } } as never,
      projection: { _id: 1 },
    });
    return await channelAudio.findOne({
      filters: { _id: audioId },
      projection: get,
    });
  }

  const now = new Date();
  const position = set.position ?? target!.audioCount ?? 0;

  await channelAudio.deleteOne({ filter: { _id: audioId } });

  const created = await channelAudio.insertOne({
    doc: {
      contentHash: src.contentHash,
      title: src.title,
      description: src.description,
      category: src.category,
      tags: src.tags,
      audioUrl: src.audioUrl,
      mediaPath: src.mediaPath,
      durationSec: src.durationSec,
      fileSizeBytes: src.fileSizeBytes,
      mimeType: src.mimeType,
      isAudiobook: src.isAudiobook,
      author: src.author,
      narrator: src.narrator,
      artworkUrl: src.artworkUrl,
      position,
      languageCode: src.languageCode,
      status: src.status,
      createdAt: src.createdAt,
      updatedAt: now,
    },
    relations: {
      channel: { _ids: channelId, relatedRelations: {} },
      channelPlaylist: { _ids: targetFolderId, relatedRelations: {} },
      user: { _ids: userId, relatedRelations: {} },
    } as never,
    projection: { _id: 1 },
  });
  if (!created) throwError("Audio was not moved");

  if (sourceFolderId) {
    await channelPlaylist.findOneAndUpdate({
      filter: { _id: sourceFolderId },
      update: { $inc: { audioCount: -1 }, $set: { updatedAt: now } } as never,
      projection: { _id: 1 },
    });
  }
  await channelPlaylist.findOneAndUpdate({
    filter: { _id: targetFolderId },
    update: { $inc: { audioCount: 1 }, $set: { updatedAt: now } } as never,
    projection: { _id: 1 },
  });

  return await channelAudio.findOne({
    filters: { _id: created!._id },
    projection: get,
  });
};
