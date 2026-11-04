import { type ActFn, ObjectId } from "lesan";
import {
  annotation,
  coreApp,
  onlineCollection,
  playbackContext,
  playbackSession,
  playlist,
  track,
} from "../../../mod.ts";
import { type MyContext } from "@lib";
import {
  mergeSetting,
  readCanonicalSetting,
  type SettingInput,
} from "../../settings/mergeSetting.ts";
import {
  historyQuotaOf,
  playlistQuotaOf,
  quotaOf,
  resolveEntitlement,
} from "../../entitlements/entitlement.ts";

type SessionRow = {
  clientId: string;
  contentHash: string;
  startedAt: number;
  endedAt?: number;
  startPositionSec: number;
  endPositionSec: number;
  durationListenedSec: number;
  playbackSpeed: number;
  completed: boolean;
  interrupted: boolean;
  deviceInfo?: string;
  contextPlayId?: string;
  contextType?: string;
  contextKey?: string;
  stretchId?: string;
  seeked: boolean;
};

export const syncLocalDataFn: ActFn = async (body) => {
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const {
    set: {
      sessions: rawSessions = [],
      annotations = [],
      playlists = [],
      contextPlays = [],
      onlineCollections = [],
      settings,
    },
  } = body.details;

  // Lesan types `details` loosely; the validator above is what guarantees this
  // shape, so the cast is a description of the contract rather than a promise
  // that could be wrong at runtime.
  const sessions = rawSessions as SessionRow[];

  const userId = new ObjectId(user._id);
  let syncedSessions = 0;
  let syncedAnnotations = 0;
  let syncedPlaylists = 0;
  let syncedContextPlays = 0;
  let syncedOnlineCollections = 0;
  let skippedPlaylists = 0;
  const annotationMappings: { clientId: string; serverId?: string }[] = [];
  const playlistMappings: { clientId: string; serverId?: string }[] = [];
  const contextPlayMappings: { clientId: string; serverId?: string }[] = [];
  const onlineCollectionMappings: { clientId: string; serverId?: string }[] =
    [];

  // ── Plan limits ──────────────────────────────────────────────────────────
  // Resolved once for the whole batch: the entitlement is the same for every
  // row, and a sync is the only place a listener's stored history grows.
  const entitlement = await resolveEntitlement(userId);
  const historyBefore = await historyQuotaOf(userId, entitlement.limits);
  const playlistBefore = await playlistQuotaOf(userId, entitlement.limits);

  /**
   * Rows the server already has are removed **before** the quota is applied.
   *
   * A device resends its batch whenever a response is lost, so a full queue is
   * the normal case, not the exception. Counting those duplicates as "skipped
   * by your plan" would tell the listener their history was refused when it is
   * already stored — the one message that must never be wrong.
   *
   * What is left is then accepted **newest-first**, and the overflow is
   * skipped rather than refused. Skipping is the only safe failure mode: the
   * device keeps its own row, the batch still succeeds (a rejected sync would
   * be retried forever and would also lose the annotations and runs travelling
   * with it), and the quota in the response is what the app turns into an
   * upgrade prompt.
   *
   * Deleting the oldest server rows to make room was considered and rejected:
   * the listener already had that history, and a paywall must not be the reason
   * it disappears. A plan without cross-device sync skips the section entirely
   * — history then lives on the device only, which is what that plan says.
   */
  const knownClientIds = new Set(
    (sessions.length > 0
      ? await playbackSession
        .aggregation({
          pipeline: [
            {
              $match: {
                "user._id": userId,
                clientId: { $in: sessions.map((session) => session.clientId) },
              },
            },
            { $project: { clientId: 1 } },
          ],
        })
        .toArray()
      : []).map((row) => String(row.clientId)),
  );

  const pendingSessions = sessions.filter((session) =>
    !knownClientIds.has(String(session.clientId))
  );

  const orderedSessions = [...pendingSessions].sort((a, b) =>
    b.startedAt - a.startedAt
  );
  const acceptedSessions = entitlement.limits.crossDeviceSync
    ? (historyBefore.unlimited
      ? orderedSessions
      : orderedSessions.slice(0, historyBefore.remaining))
    : [];
  const sessionsSkipped = pendingSessions.length - acceptedSessions.length;

  let playlistSlots = playlistBefore.unlimited
    ? Number.POSITIVE_INFINITY
    : playlistBefore.remaining;

  // Runs first, so a session that names one can be linked to a row that already
  // exists. A session whose run is missing is still stored — the session is the
  // primary record and losing it to a batch ordering would be worse than a
  // history entry with no collection attached.
  for (const run of contextPlays) {
    const alreadySynced = await playbackContext.findOne({
      filters: { clientId: run.clientId, "user._id": userId },
      projection: { _id: 1 },
    });

    if (alreadySynced) {
      contextPlayMappings.push({
        clientId: run.clientId,
        serverId: String(alreadySynced._id),
      });
      continue;
    }

    const inserted = await playbackContext.insertOne({
      doc: {
        clientId: run.clientId,
        contextType: run.contextType,
        contextKey: run.contextKey,
        contextTitle: run.contextTitle,
        trackCount: run.trackCount,
        startedAt: run.startedAt,
        endedAt: run.endedAt,
        lastIndex: run.lastIndex,
        lastTrackId: run.lastTrackId,
        lastPositionSec: run.lastPositionSec,
        listenedSec: run.listenedSec,
        finishedCount: run.finishedCount,
        completed: run.completed,
        interrupted: run.interrupted,
        createdAt: new Date(),
        updatedAt: new Date(run.updatedAt ?? Date.now()),
      },
      relations: {
        user: {
          _ids: userId,
          relatedRelations: { playbackContexts: true },
        },
      } as never,
      projection: { _id: 1 },
    });

    if (inserted) {
      contextPlayMappings.push({
        clientId: run.clientId,
        serverId: String(inserted._id),
      });
      syncedContextPlays += 1;
    }
  }

  // Inserted oldest-first even though the quota was applied newest-first, so
  // the track aggregates (`lastPlayedAt`) end on the most recent session.
  for (
    const session of [...acceptedSessions].sort((a, b) =>
      a.startedAt - b.startedAt
    )
  ) {
    const parentTrack = await track.findOne({
      filters: { contentHash: session.contentHash, "user._id": userId },
      projection: { _id: 1 },
    });
    if (!parentTrack) continue;

    const alreadySynced = await playbackSession.findOne({
      filters: { clientId: session.clientId, "user._id": userId },
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
        contextPlayId: session.contextPlayId,
        contextType: session.contextType,
        contextKey: session.contextKey,
        stretchId: session.stretchId,
        seeked: session.seeked,
        createdAt: new Date(),
        updatedAt: new Date(),
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
      filters: { clientId: note.clientId, "user._id": userId },
      projection: { _id: 1, updatedAt: 1 },
    });

    const incomingUpdatedAt = note.updatedAt ?? Date.now();

    // Tombstone from a local hard/soft delete: remove the server row if present.
    // Like an edit, a delete is last-write-wins, so a stale tombstone cannot
    // erase an annotation that was edited more recently on another device.
    if (note.deleted) {
      if (existing) {
        const existingUpdatedAt = existing.updatedAt
          ? new Date(existing.updatedAt).getTime()
          : 0;
        if (incomingUpdatedAt > existingUpdatedAt) {
          await annotation.deleteOne({ filter: { _id: existing._id } });
          syncedAnnotations += 1;
        }
      }
      continue;
    }

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
        timesPlayedBefore: 0,
        createdAt: new Date(),
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

  for (const list of playlists) {
    const existing = await playlist.findOne({
      filters: { clientId: list.clientId, "user._id": userId },
      projection: { _id: 1, updatedAt: 1 },
    });

    const incomingUpdatedAt = list.updatedAt ?? Date.now();

    // Tombstone from a local delete: remove the server row if present. LWW, so
    // a stale delete cannot beat a newer rename made on another device.
    if (list.deleted) {
      if (existing) {
        const existingUpdatedAt = existing.updatedAt
          ? new Date(existing.updatedAt).getTime()
          : 0;
        if (incomingUpdatedAt > existingUpdatedAt) {
          await playlist.deleteOne({ filter: { _id: existing._id } });
          syncedPlaylists += 1;
        }
      }
      continue;
    }

    // Resolve item content hashes to this user's server track ids.
    const resolvedItems: { trackId: string; order: number }[] = [];
    for (const item of list.items ?? []) {
      const parentTrack = await track.findOne({
        filters: { contentHash: item.contentHash, "user._id": userId },
        projection: { _id: 1 },
      });
      if (parentTrack) {
        resolvedItems.push({
          trackId: String(parentTrack._id),
          order: item.order,
        });
      }
    }

    if (existing) {
      const existingUpdatedAt = existing.updatedAt
        ? new Date(existing.updatedAt).getTime()
        : 0;

      // Last-write-wins: only overwrite when the local edit is newer.
      if (incomingUpdatedAt > existingUpdatedAt) {
        await playlist.findOneAndUpdate({
          filter: { _id: existing._id },
          update: {
            $set: {
              title: list.title,
              ...(list.description !== undefined
                ? { description: list.description }
                : {}),
              isPublic: list.isPublic ?? false,
              items: resolvedItems,
              updatedAt: new Date(incomingUpdatedAt),
            },
          },
          projection: { _id: 1 },
        });
      }

      playlistMappings.push({
        clientId: list.clientId,
        serverId: String(existing._id),
      });
      syncedPlaylists += 1;
      continue;
    }

    // Edits and tombstones above are always honoured; only a *new* playlist can
    // run out of slots, so a capped plan can still rename and delete.
    if (playlistSlots <= 0) {
      skippedPlaylists += 1;
      continue;
    }

    const inserted = await playlist.insertOne({
      doc: {
        clientId: list.clientId,
        title: list.title,
        ...(list.description !== undefined
          ? { description: list.description }
          : {}),
        isPublic: list.isPublic ?? false,
        items: resolvedItems,
        createdAt: new Date(),
        updatedAt: new Date(incomingUpdatedAt),
      },
      relations: {
        user: {
          _ids: userId,
          relatedRelations: { playlists: true },
        },
      } as never,
      projection: { _id: 1 },
    });

    if (inserted) {
      playlistMappings.push({
        clientId: list.clientId,
        serverId: String(inserted._id),
      });
      syncedPlaylists += 1;
      playlistSlots -= 1;
    }
  }

  // Online collections last: nothing else in the batch depends on them, and a
  // collection is an address rather than a parent row — the tracks inside it are
  // registered as tracks, so there is no ordering requirement either way.
  for (const saved of onlineCollections) {
    // The key is derived from the source's own ids rather than trusted from the
    // payload, so it can never disagree with what the dedicated act writes.
    const clientId = `${saved.sourceId}:${saved.externalId}`;

    const existing = await onlineCollection.findOne({
      filters: { clientId, "user._id": userId },
      projection: { _id: 1, updatedAt: 1 },
    });

    const incomingUpdatedAt = saved.updatedAt ?? Date.now();

    // Tombstone from a local delete: remove the server row if present. LWW, so
    // a stale delete cannot erase a newer favourite from another device.
    if (saved.deleted) {
      if (existing) {
        const existingUpdatedAt = existing.updatedAt
          ? new Date(existing.updatedAt).getTime()
          : 0;
        if (incomingUpdatedAt > existingUpdatedAt) {
          await onlineCollection.deleteOne({ filter: { _id: existing._id } });
          syncedOnlineCollections += 1;
        }
      }
      continue;
    }

    if (existing) {
      const existingUpdatedAt = existing.updatedAt
        ? new Date(existing.updatedAt).getTime()
        : 0;

      // Last-write-wins: only overwrite when the local edit is newer.
      if (incomingUpdatedAt > existingUpdatedAt) {
        await onlineCollection.findOneAndUpdate({
          filter: { _id: existing._id },
          update: {
            $set: {
              title: saved.title,
              languageCode: saved.languageCode,
              trackCount: saved.trackCount,
              isFavorite: saved.isFavorite,
              ...(saved.subtitle !== undefined
                ? { subtitle: saved.subtitle }
                : {}),
              ...(saved.artworkUrl !== undefined
                ? { artworkUrl: saved.artworkUrl }
                : {}),
              ...(saved.pageUrl !== undefined
                ? { pageUrl: saved.pageUrl }
                : {}),
              ...(saved.lastOpenedAt !== undefined
                ? { lastOpenedAt: saved.lastOpenedAt }
                : {}),
              updatedAt: new Date(incomingUpdatedAt),
            },
          },
          projection: { _id: 1 },
        });
      }

      onlineCollectionMappings.push({
        clientId,
        serverId: String(existing._id),
      });
      syncedOnlineCollections += 1;
      continue;
    }

    const inserted = await onlineCollection.insertOne({
      doc: {
        clientId,
        sourceId: saved.sourceId,
        externalId: saved.externalId,
        title: saved.title,
        languageCode: saved.languageCode,
        subtitle: saved.subtitle,
        artworkUrl: saved.artworkUrl,
        trackCount: saved.trackCount,
        pageUrl: saved.pageUrl,
        isFavorite: saved.isFavorite,
        lastOpenedAt: saved.lastOpenedAt,
        createdAt: new Date(),
        updatedAt: new Date(incomingUpdatedAt),
      },
      relations: {
        user: {
          _ids: userId,
          relatedRelations: { onlineCollections: true },
        },
      } as never,
      projection: { _id: 1 },
    });

    if (inserted) {
      onlineCollectionMappings.push({
        clientId,
        serverId: String(inserted._id),
      });
      syncedOnlineCollections += 1;
    }
  }

  // Settings are a snapshot, not a batch: the device sends every field, so the
  // same LWW merge used by updateMySettings can be reused without duplication.
  // The authoritative object is always returned, turning a sync into a pull.
  let syncedSettings = 0;
  let authoritativeSetting;

  if (settings) {
    const merged = await mergeSetting(
      userId,
      settings as SettingInput,
      "snapshot",
    );
    syncedSettings = merged.applied ? 1 : 0;
    authoritativeSetting = merged.setting;
  } else {
    authoritativeSetting = await readCanonicalSetting(userId);
  }

  return {
    syncedSessions,
    syncedAnnotations,
    syncedPlaylists,
    syncedContextPlays,
    syncedOnlineCollections,
    syncedSettings,
    settings: authoritativeSetting,
    // Returned on every sync, not only when something was skipped: the app
    // shows the meter on the account screen and needs it to be current even
    // for a batch that was entirely duplicates.
    historyQuota: quotaOf(
      entitlement.limits.historyEntries,
      historyBefore.used + syncedSessions,
    ),
    historySkipped: sessionsSkipped,
    playlistsQuota: quotaOf(
      entitlement.limits.playlists,
      playlistBefore.used + syncedPlaylists,
    ),
    playlistsSkipped: skippedPlaylists,
    crossDeviceSync: entitlement.limits.crossDeviceSync,
    annotations: annotationMappings,
    playlists: playlistMappings,
    contextPlays: contextPlayMappings,
    onlineCollections: onlineCollectionMappings,
  };
};
