import {
  reconcileAnnotations,
  reconcileOnlineCollections,
  reconcilePlaylists,
  reconcileSessions,
  reconcileTracks,
  type RemoteAnnotation,
  type RemoteOnlineCollection,
  type RemotePlaylist,
  type RemoteSession,
  type RemoteTrack,
} from "@/lib/reconcile";
import type {
  LocalAnnotation,
  LocalOnlineCollection,
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
    source: null,
    sourceUri: null,
    sourcePath: null,
    sourceSize: null,
    sourceMtime: null,
    folderKey: null,
    folderName: null,
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
    origin: "local",
    streamUrl: null,
    sourceId: null,
    externalId: null,
    collectionKey: null,
    collectionTitle: null,
    downloadedAt: null,
    downloadPath: null,
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
    contextPlayId: null,
    contextType: null,
    contextKey: null,
    stretchId: overrides.stretchId ?? overrides.id ?? "ls1",
    seeked: false,
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
  contextPlayId: null,
  contextType: null,
  contextKey: null,
  stretchId: null,
  seeked: false,
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

function localOnlineCollection(
  overrides: Partial<LocalOnlineCollection> = {},
): LocalOnlineCollection {
  return {
    key: "manahej:190",
    serverId: null,
    sourceId: "manahej",
    externalId: "190",
    title: "Local",
    subtitle: null,
    artworkUrl: null,
    languageCode: "fa",
    trackCount: 12,
    pageUrl: null,
    isFavorite: false,
    lastOpenedAt: null,
    downloadState: "none",
    deletedAt: null,
    syncStatus: "synced",
    createdAt: 0,
    updatedAt: 100,
    ...overrides,
  };
}

const remoteOnlineCollection: RemoteOnlineCollection = {
  serverId: "srv-c",
  clientId: "manahej:190",
  sourceId: "manahej",
  externalId: "190",
  title: "Remote",
  subtitle: null,
  artworkUrl: null,
  languageCode: "fa",
  trackCount: 12,
  pageUrl: "https://manahej.ir/?p=190",
  isFavorite: true,
  lastOpenedAt: null,
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

describe("reconcileOnlineCollections", () => {
  it("inserts collections missing locally", () => {
    expect(reconcileOnlineCollections([], [remoteOnlineCollection]).inserts).toEqual([
      remoteOnlineCollection,
    ]);
  });

  it("updates when the remote edit is newer (LWW)", () => {
    const result = reconcileOnlineCollections(
      [localOnlineCollection({ updatedAt: 50 })],
      [remoteOnlineCollection],
    );
    expect(result.updates).toEqual([
      {
        id: "manahej:190",
        serverId: "srv-c",
        title: "Remote",
        subtitle: null,
        artworkUrl: null,
        trackCount: 12,
        pageUrl: "https://manahej.ir/?p=190",
        isFavorite: true,
        lastOpenedAt: null,
        updatedAt: 200,
      },
    ]);
  });

  it("keeps a newer local edit", () => {
    const result = reconcileOnlineCollections(
      [localOnlineCollection({ updatedAt: 500 })],
      [remoteOnlineCollection],
    );
    expect(result.updates).toEqual([]);
  });

  it("does not resurrect a collection deleted on this device", () => {
    // A removal is a decision, not a gap. Re-inserting it would undo the
    // listener's own action every time they synced.
    const result = reconcileOnlineCollections(
      [localOnlineCollection({ deletedAt: 999 })],
      [remoteOnlineCollection],
    );
    expect(result.inserts).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("backfills the server id when unchanged", () => {
    const result = reconcileOnlineCollections(
      [localOnlineCollection({ updatedAt: 200 })],
      [remoteOnlineCollection],
    );
    expect(result.updates).toEqual([]);
    expect(result.backfill).toEqual([{ id: "manahej:190", serverId: "srv-c" }]);
  });

  it("matches on the derived key when the row arrived without a clientId", () => {
    // The key is derivable from the source's own ids, so a row missing it is
    // still the same collection rather than a second copy of it.
    const result = reconcileOnlineCollections(
      [localOnlineCollection({ updatedAt: 500 })],
      [{ ...remoteOnlineCollection, clientId: null }],
    );
    expect(result.inserts).toEqual([]);
    expect(result.updates).toEqual([]);
  });
});
