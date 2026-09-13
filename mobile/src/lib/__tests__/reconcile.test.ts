import {
  reconcileAnnotations,
  reconcilePlaylists,
  reconcileSessions,
  reconcileTracks,
  type RemoteAnnotation,
  type RemotePlaylist,
  type RemoteSession,
  type RemoteTrack,
} from "@/lib/reconcile";
import type {
  LocalAnnotation,
  LocalPlaylist,
  LocalSession,
  LocalTrack,
} from "@/lib/db/types";

function localTrack(overrides: Partial<LocalTrack> = {}): LocalTrack {
  return {
    id: "lt1",
    serverId: null,
    contentHash: "hash-a",
    title: "A",
    fileName: null,
    fileUri: "file://a",
    durationSec: 60,
    fileSizeBytes: 1,
    mimeType: null,
    isAudiobook: false,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function localSession(overrides: Partial<LocalSession> = {}): LocalSession {
  return {
    id: "ls1",
    serverId: null,
    trackId: "lt1",
    contentHash: "hash-a",
    startedAt: 1,
    endedAt: 2,
    startPositionSec: 0,
    endPositionSec: 10,
    durationListenedSec: 10,
    playbackSpeed: 1,
    completed: false,
    interrupted: false,
    deviceInfo: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}

function localAnnotation(overrides: Partial<LocalAnnotation> = {}): LocalAnnotation {
  return {
    id: "la1",
    serverId: null,
    trackId: "lt1",
    contentHash: "hash-a",
    positionSec: 5,
    text: "local",
    tags: [],
    color: null,
    timesPlayedBefore: 0,
    deletedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 100,
    ...overrides,
  };
}

const remoteTrack: RemoteTrack = {
  serverId: "srv-t",
  contentHash: "hash-a",
  title: "A",
  durationSec: 60,
  fileSizeBytes: 1,
  isAudiobook: false,
  author: null,
  narrator: null,
};

const remoteSession: RemoteSession = {
  serverId: "srv-s",
  clientId: "ls1",
  contentHash: "hash-a",
  startedAt: 1,
  endedAt: 2,
  startPositionSec: 0,
  endPositionSec: 10,
  durationListenedSec: 10,
  playbackSpeed: 1,
  completed: false,
  interrupted: false,
};

function localPlaylist(overrides: Partial<LocalPlaylist> = {}): LocalPlaylist {
  return {
    id: "lp1",
    serverId: null,
    title: "Local",
    description: null,
    isPublic: false,
    items: [{ trackId: "lt1", order: 0 }],
    deletedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 100,
    ...overrides,
  };
}

const remotePlaylist: RemotePlaylist = {
  serverId: "srv-p",
  clientId: "lp1",
  title: "Remote",
  description: null,
  isPublic: false,
  items: [{ trackId: "lt1", order: 0 }],
  updatedAt: 200,
};

const remoteAnnotation: RemoteAnnotation = {
  serverId: "srv-a",
  clientId: "la1",
  contentHash: "hash-a",
  positionSec: 5,
  text: "remote",
  tags: [],
  color: null,
  updatedAt: 200,
};

describe("reconcileTracks", () => {
  it("inserts tracks missing locally", () => {
    expect(reconcileTracks([], [remoteTrack]).inserts).toEqual([remoteTrack]);
  });

  it("backfills the server id on an existing local track", () => {
    const result = reconcileTracks([localTrack()], [remoteTrack]);
    expect(result.inserts).toEqual([]);
    expect(result.backfill).toEqual([{ id: "lt1", serverId: "srv-t" }]);
  });

  it("ignores tracks already linked", () => {
    const result = reconcileTracks([localTrack({ serverId: "srv-t" })], [remoteTrack]);
    expect(result.inserts).toEqual([]);
    expect(result.backfill).toEqual([]);
  });
});

describe("reconcileSessions", () => {
  it("inserts sessions missing locally (deduped by clientId)", () => {
    expect(reconcileSessions([], [remoteSession]).inserts).toEqual([remoteSession]);
  });

  it("does not duplicate a session that already exists", () => {
    const result = reconcileSessions([localSession({ serverId: "srv-s" })], [remoteSession]);
    expect(result.inserts).toEqual([]);
  });

  it("backfills the server id on an existing local session", () => {
    expect(reconcileSessions([localSession()], [remoteSession]).backfill).toEqual([
      { id: "ls1", serverId: "srv-s" },
    ]);
  });
});

describe("reconcileAnnotations", () => {
  it("inserts annotations missing locally", () => {
    expect(reconcileAnnotations([], [remoteAnnotation]).inserts).toEqual([remoteAnnotation]);
  });

  it("updates when the remote edit is newer (LWW)", () => {
    const result = reconcileAnnotations([localAnnotation({ updatedAt: 50 })], [remoteAnnotation]);
    expect(result.updates).toEqual([
      {
        id: "la1",
        serverId: "srv-a",
        text: "remote",
        tags: [],
        color: null,
        updatedAt: 200,
      },
    ]);
  });

  it("keeps a newer local edit that is still pending", () => {
    const result = reconcileAnnotations(
      [localAnnotation({ updatedAt: 500, syncStatus: "pending", text: "mine" })],
      [remoteAnnotation],
    );
    expect(result.updates).toEqual([]);
  });

  it("does not resurrect a locally deleted annotation", () => {
    const result = reconcileAnnotations([localAnnotation({ deletedAt: 999 })], [remoteAnnotation]);
    expect(result.inserts).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("backfills the server id without changing text when unchanged", () => {
    const result = reconcileAnnotations(
      [localAnnotation({ updatedAt: 200, text: "remote" })],
      [remoteAnnotation],
    );
    expect(result.updates).toEqual([]);
    expect(result.backfill).toEqual([{ id: "la1", serverId: "srv-a" }]);
  });
});

describe("reconcilePlaylists", () => {
  it("inserts playlists missing locally", () => {
    expect(reconcilePlaylists([], [remotePlaylist]).inserts).toEqual([remotePlaylist]);
  });

  it("updates when the remote edit is newer (LWW)", () => {
    const result = reconcilePlaylists([localPlaylist({ updatedAt: 50 })], [remotePlaylist]);
    expect(result.updates).toEqual([
      {
        id: "lp1",
        serverId: "srv-p",
        title: "Remote",
        description: null,
        isPublic: false,
        items: [{ trackId: "lt1", order: 0 }],
        updatedAt: 200,
      },
    ]);
  });

  it("keeps a newer local edit", () => {
    const result = reconcilePlaylists([localPlaylist({ updatedAt: 500 })], [remotePlaylist]);
    expect(result.updates).toEqual([]);
  });

  it("does not resurrect a locally deleted playlist", () => {
    const result = reconcilePlaylists([localPlaylist({ deletedAt: 999 })], [remotePlaylist]);
    expect(result.inserts).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("backfills the server id when unchanged", () => {
    const result = reconcilePlaylists([localPlaylist({ updatedAt: 200 })], [remotePlaylist]);
    expect(result.updates).toEqual([]);
    expect(result.backfill).toEqual([{ id: "lp1", serverId: "srv-p" }]);
  });
});
