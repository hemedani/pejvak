import type {
  ContextType,
  LocalAnnotation,
  LocalContextPlay,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
  PlaylistItem,
} from "@/lib/db/types";

export type RemoteTrack = {
  serverId: string;
  contentHash: string;
  title: string;
  durationSec: number;
  fileSizeBytes: number;
  isAudiobook: boolean;
  author: string | null;
  narrator: string | null;
};

export type RemoteSession = {
  serverId: string;
  /** Original local id; the dedupe key against local rows. */
  clientId: string | null;
  contentHash: string;
  startedAt: number;
  endedAt: number | null;
  startPositionSec: number;
  endPositionSec: number | null;
  durationListenedSec: number;
  playbackSpeed: number;
  completed: boolean;
  interrupted: boolean;
  /** The run this session belonged to, when it was part of a collection. */
  contextPlayId: string | null;
  contextType: ContextType | null;
  contextKey: string | null;
  /** The stretch the origin device grouped this session under, if it said. */
  stretchId: string | null;
  /** Whether the listener scrubbed during it, as the origin device recorded. */
  seeked: boolean;
};

/**
 * A run through a collection, as the server holds it.
 *
 * `contextKey` is a *local* playlist id or a folder key. A playlist id is
 * stable across a device's own lifetime and travels with the run, so a second
 * device can match the run to the playlist it pulls — the same way
 * `contentHash` lets a session find its track. A folder key is a path, which
 * only means anything on a device that has that folder; a run whose folder is
 * absent is still a true record of listening, so it is kept and simply has no
 * screen to open.
 */
export type RemoteContextPlay = {
  serverId: string;
  /** Original local id; the dedupe key against local rows. */
  clientId: string | null;
  contextType: ContextType;
  contextKey: string;
  contextTitle: string;
  trackCount: number;
  startedAt: number;
  endedAt: number | null;
  lastIndex: number;
  lastTrackId: string | null;
  lastPositionSec: number;
  listenedSec: number;
  finishedCount: number;
  completed: boolean;
  interrupted: boolean;
  updatedAt: number;
};

export type RemoteAnnotation = {
  serverId: string;
  clientId: string | null;
  contentHash: string;
  positionSec: number;
  text: string;
  tags: string[];
  color: string | null;
  updatedAt: number;
};

export type AnnotationUpdate = {
  id: string;
  serverId: string;
  text: string;
  tags: string[];
  color: string | null;
  updatedAt: number;
};

export type RemotePlaylist = {
  serverId: string;
  /** Original local id; the dedupe key against local rows. */
  clientId: string | null;
  title: string;
  description: string | null;
  isPublic: boolean;
  /** Server track ids already resolved to local track ids by the caller. */
  items: PlaylistItem[];
  updatedAt: number;
};

export type PlaylistUpdate = {
  id: string;
  serverId: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  items: PlaylistItem[];
  updatedAt: number;
};

export type Backfill = { id: string; serverId: string };

function remoteLocalId(remote: { clientId: string | null; serverId: string }): string {
  return remote.clientId ?? remote.serverId;
}

/** Tracks are matched by `contentHash` (the identity of a file across devices). */
export function reconcileTracks(
  local: LocalTrack[],
  remote: RemoteTrack[],
): { inserts: RemoteTrack[]; backfill: Backfill[] } {
  const byHash = new Map(local.map((track) => [track.contentHash, track]));
  const inserts: RemoteTrack[] = [];
  const backfill: Backfill[] = [];

  for (const item of remote) {
    const existing = byHash.get(item.contentHash);
    if (!existing) {
      inserts.push(item);
    } else if (!existing.serverId) {
      backfill.push({ id: existing.id, serverId: item.serverId });
    }
  }

  return { inserts, backfill };
}

/** Sessions are append-only; deduped by `clientId` so re-pulls never duplicate. */
export function reconcileSessions(
  local: LocalSession[],
  remote: RemoteSession[],
): { inserts: RemoteSession[]; backfill: Backfill[] } {
  const byId = new Map(local.map((session) => [session.id, session]));
  const inserts: RemoteSession[] = [];
  const backfill: Backfill[] = [];

  for (const item of remote) {
    const id = remoteLocalId(item);
    const existing = byId.get(id);
    if (!existing) {
      inserts.push(item);
    } else if (!existing.serverId) {
      backfill.push({ id, serverId: item.serverId });
    }
  }

  return { inserts, backfill };
}

/**
 * Runs dedupe by `clientId`, like sessions — a run is written once, when it
 * ends, and never edited afterwards. There is therefore no update path and no
 * last-write-wins: the only question is whether the row is already here.
 */
export function reconcileContextPlays(
  local: LocalContextPlay[],
  remote: RemoteContextPlay[],
): { inserts: RemoteContextPlay[]; backfill: Backfill[] } {
  const byId = new Map(local.map((run) => [run.id, run]));
  const inserts: RemoteContextPlay[] = [];
  const backfill: Backfill[] = [];

  for (const item of remote) {
    const id = remoteLocalId(item);
    const existing = byId.get(id);
    if (!existing) {
      inserts.push(item);
    } else if (!existing.serverId) {
      backfill.push({ id, serverId: item.serverId });
    }
  }

  return { inserts, backfill };
}

/**
 * Annotations dedupe by `clientId`. Edits use last-write-wins on `updatedAt`;
 * a local tombstone is never resurrected by a pull.
 */
export function reconcileAnnotations(
  local: LocalAnnotation[],
  remote: RemoteAnnotation[],
): { inserts: RemoteAnnotation[]; updates: AnnotationUpdate[]; backfill: Backfill[] } {
  const byId = new Map(local.map((annotation) => [annotation.id, annotation]));
  const inserts: RemoteAnnotation[] = [];
  const updates: AnnotationUpdate[] = [];
  const backfill: Backfill[] = [];

  for (const item of remote) {
    const id = remoteLocalId(item);
    const existing = byId.get(id);
    if (!existing) {
      inserts.push(item);
      continue;
    }
    if (existing.deletedAt !== null) {
      continue;
    }
    if (item.updatedAt > existing.updatedAt) {
      updates.push({
        id,
        serverId: item.serverId,
        text: item.text,
        tags: item.tags,
        color: item.color,
        updatedAt: item.updatedAt,
      });
      continue;
    }
    if (!existing.serverId) {
      backfill.push({ id, serverId: item.serverId });
    }
  }

  return { inserts, updates, backfill };
}

/**
 * Playlists dedupe by `clientId` (falling back to the server id for
 * server-created rows). Edits use last-write-wins on `updatedAt`; a local
 * tombstone is never resurrected by a pull.
 */
export function reconcilePlaylists(
  local: LocalPlaylist[],
  remote: RemotePlaylist[],
): {
  inserts: RemotePlaylist[];
  updates: PlaylistUpdate[];
  backfill: Backfill[];
} {
  const byId = new Map(local.map((playlist) => [playlist.id, playlist]));
  const inserts: RemotePlaylist[] = [];
  const updates: PlaylistUpdate[] = [];
  const backfill: Backfill[] = [];

  for (const item of remote) {
    const id = remoteLocalId(item);
    const existing = byId.get(id);
    if (!existing) {
      inserts.push(item);
      continue;
    }
    if (existing.deletedAt !== null) {
      continue;
    }
    if (item.updatedAt > existing.updatedAt) {
      updates.push({
        id,
        serverId: item.serverId,
        title: item.title,
        description: item.description,
        isPublic: item.isPublic,
        items: item.items,
        updatedAt: item.updatedAt,
      });
      continue;
    }
    if (!existing.serverId) {
      backfill.push({ id, serverId: item.serverId });
    }
  }

  return { inserts, updates, backfill };
}
