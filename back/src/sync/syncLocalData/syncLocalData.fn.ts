import { type ActFn, ObjectId } from "lesan";
import { annotation, coreApp, playbackSession, track } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const syncLocalDataFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const {
    set: { sessions, annotations },
  } = body.details;

  const userId = new ObjectId(user._id);
  let syncedSessions = 0;
  let syncedAnnotations = 0;
  const annotationMappings: { clientId: string; serverId?: string }[] = [];

  for (const session of sessions) {
    const parentTrack = await track.findOne({
      filters: { contentHash: session.contentHash, "user._id": userId },
      projection: { _id: 1 },
    });
    if (!parentTrack) continue;

    const alreadySynced = await playbackSession.findOne({
      filters: { clientId: session.clientId },
      projection: { _id: 1 },
    });
    if (alreadySynced) continue;

    await playbackSession.insertOne({
      doc: {
        clientId: session.clientId,
        contentHash: session.contentHash,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        startPositionSec: session.startPositionSec,
        endPositionSec: session.endPositionSec,
        durationListenedSec: session.durationListenedSec,
        playbackSpeed: session.playbackSpeed,
        completed: session.completed,
        interrupted: session.interrupted,
        deviceInfo: session.deviceInfo,
      },
      relations: {
        track: {
          _ids: parentTrack._id,
          relatedRelations: { sessions: true },
        },
        user: {
          _ids: userId,
          relatedRelations: { sessions: true },
        },
      } as never,
      projection: { _id: 1 },
    });

    await track.findOneAndUpdate({
      filter: { _id: parentTrack._id },
      update: {
        $inc: {
          totalPlayCount: 1,
          totalListenTimeSec: session.durationListenedSec,
        },
        $set: {
          lastPlayedAt: session.endedAt ?? session.startedAt,
          updatedAt: new Date(),
        },
      },
      projection: { _id: 1 },
    });

    syncedSessions += 1;
  }

  for (const note of annotations) {
    const parentTrack = await track.findOne({
      filters: { contentHash: note.contentHash, "user._id": userId },
      projection: { _id: 1 },
    });
    if (!parentTrack) continue;

    const existing = await annotation.findOne({
      filters: { clientId: note.clientId },
      projection: { _id: 1, updatedAt: 1 },
    });

    // Tombstone from a local hard/soft delete: remove the server row if present.
    if (note.deleted) {
      if (existing) {
        await annotation.deleteOne({ filter: { _id: existing._id } });
        syncedAnnotations += 1;
      }
      continue;
    }

    const incomingUpdatedAt = note.updatedAt ?? Date.now();

    if (existing) {
      const existingUpdatedAt = existing.updatedAt
        ? new Date(existing.updatedAt).getTime()
        : 0;

      // Last-write-wins: only overwrite when the local edit is newer.
      if (incomingUpdatedAt > existingUpdatedAt) {
        await annotation.findOneAndUpdate({
          filter: { _id: existing._id },
          update: {
            $set: {
              text: note.text,
              tags: note.tags,
              color: note.color,
              updatedAt: new Date(incomingUpdatedAt),
            },
          },
          projection: { _id: 1 },
        });
      }

      annotationMappings.push({
        clientId: note.clientId,
        serverId: String(existing._id),
      });
      syncedAnnotations += 1;
      continue;
    }

    const inserted = await annotation.insertOne({
      doc: {
        clientId: note.clientId,
        positionSec: note.positionSec,
        text: note.text,
        tags: note.tags,
        color: note.color,
        updatedAt: new Date(incomingUpdatedAt),
      },
      relations: {
        track: {
          _ids: parentTrack._id,
          relatedRelations: { annotations: true },
        },
        user: {
          _ids: userId,
          relatedRelations: { annotations: true },
        },
      } as never,
      projection: { _id: 1 },
    });

    if (inserted) {
      annotationMappings.push({
        clientId: note.clientId,
        serverId: String(inserted._id),
      });
      syncedAnnotations += 1;
    }
  }

  return { syncedSessions, syncedAnnotations, annotations: annotationMappings };
};
