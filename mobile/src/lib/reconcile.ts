import type { LocalAnnotation, LocalSession, LocalTrack } from "@/lib/db/types";

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
