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

    const alreadySynced = await annotation.findOne({
      filters: { clientId: note.clientId },
      projection: { _id: 1 },
    });
    if (alreadySynced) continue;

    await annotation.insertOne({
      doc: {
        clientId: note.clientId,
        positionSec: note.positionSec,
        text: note.text,
        tags: note.tags,
        color: note.color,
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

    syncedAnnotations += 1;
  }

  return { syncedSessions, syncedAnnotations };
};
