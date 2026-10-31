/**
 * The shapes the web player owns.
 *
 * Nothing here is a server row. A streamed item may not exist on the server
 * yet, and the queue must not wait for `registerTrack` before it can play
 * (brief §2). The wire shapes at the bottom are the subset `syncLocalData`
 * accepts — integers at the boundary, `clientId` on every row.
 */

export type PlayerOrigin = "online" | "local" | string;

/**
 * A queue entry is an immutable snapshot keyed by `contentHash`.
 *
 * It carries the three ids a resolver needs (`sourceId`, `externalId`,
 * `collectionKey`) rather than a URL. A signed URL expires; the ids do not.
 */
export type PlayerTrack = {
  contentHash: string;
  title: string;
  artist: string | null;
  albumTitle: string | null;
  artworkUrl: string | null;
  /** Source-reported, 0 means "ask the audio element". */
  durationSec: number;
  origin: PlayerOrigin;
  sourceId: string | null;
  externalId: string | null;
  collectionKey: string | null;
  collectionTitle: string | null;
  /** Known server `_id`, or null for a track not registered yet. */
  serverId: string | null;
  isLive: boolean;
};

export type PlaybackContext = {
  type: "online" | "playlist";
  /** `sourceId:externalId` for a collection, server `_id` for a playlist. */
  key: string;
  title: string;
};

/**
 * One continuous session, while it is still being listened to.
 *
 * `contextPlayId` is the run's `clientId`, not its server `_id`: a batch can
 * carry a run and its sessions before the run mapping exists.
 */
export type LocalSessionDraft = {
  clientId: string;
  contentHash: string;
  startedAt: number;
  startPositionSec: number;
  playbackSpeed: number;
  lastPositionSec: number;
  durationListenedSec: number;
  lastCheckpointAtMs: number;
  contextPlayId: string | null;
  contextType: string | null;
  contextKey: string | null;
  stretchId: string;
  seeked: boolean;
};

/** A finalized session waiting for the server to acknowledge it. */
export type QueuedSession = {
  clientId: string;
  contentHash: string;
  startedAt: number;
  endedAt: number;
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
  stretchId: string;
  seeked: boolean;
};

export type LocalRun = {
  clientId: string;
  contextType: "online" | "playlist";
  contextKey: string;
  contextTitle: string;
  /** Captured when the run opened; the denominator never grows mid-attempt. */
  trackCount: number;
  startedAt: number;
  endedAt: number | null;
  lastIndex: number;
  /** A `contentHash`, because server ids may not exist yet. */
  lastTrackId: string | null;
  lastPositionSec: number;
  /** 0 until finalized. */
  listenedSec: number;
  /** 0 until finalized. */
  finishedCount: number;
  completed: boolean;
  interrupted: boolean;
  updatedAt: number;
};

/**
 * A tally kept beside the open run so final numbers survive a sync that has
 * already acknowledged and removed some of the run's sessions.
 */
export type RunTally = {
  listenedSec: number;
  finishedHashes: string[];
};

/** A pending `registerTrack`, keyed by content hash. */
export type PendingTrack = {
  contentHash: string;
  title: string;
  durationSec: number;
  fileSizeBytes: number;
  isAudiobook: boolean;
  origin: "online";
  sourceId: string;
  externalId: string;
  collectionKey: string | null;
  collectionTitle: string | null;
  artworkUrl: string | null;
  author: string | null;
  narrator: string | null;
};

/** A local note, created or edited before the server has acknowledged it. */
export type QueuedAnnotation = {
  clientId: string;
  contentHash: string;
  positionSec: number;
  text: string;
  tags: string[];
  color?: string;
  updatedAt: number;
  deleted: boolean;
  /** Set once `syncLocalData` returns the mapping. Never sent. */
  serverId?: string;
};

export type SessionCheckpoint = {
  session: LocalSessionDraft;
  timestamp: number;
};

/** The exact `syncLocalData.set` the player builds. */
export type SyncBatch = {
  sessions: QueuedSession[];
  annotations: {
    clientId: string;
    contentHash: string;
    positionSec: number;
    text: string;
    tags: string[];
    color?: string;
    updatedAt: number;
    deleted: boolean;
  }[];
  contextPlays: {
    clientId: string;
    contextType: string;
    contextKey: string;
    contextTitle: string;
    trackCount: number;
    startedAt: number;
    endedAt: number;
    lastIndex: number;
    lastTrackId?: string;
    lastPositionSec: number;
    listenedSec: number;
    finishedCount: number;
    completed: boolean;
    interrupted: boolean;
    updatedAt: number;
  }[];
};

export type IdMapping = { clientId: string; serverId: string };

export type SyncResponse = {
  syncedSessions: number;
  syncedAnnotations: number;
  syncedContextPlays: number;
  annotations: IdMapping[];
  contextPlays: IdMapping[];
};

/** A track built from a server detail row, for a deep link into the player. */
export type PlayerTrackSeed = {
  serverId: string;
  contentHash: string;
  title: string;
  artist: string | null;
  albumTitle: string | null;
  artworkUrl: string | null;
  durationSec: number;
  origin: PlayerOrigin;
  sourceId: string | null;
  externalId: string | null;
  collectionKey: string | null;
  collectionTitle: string | null;
};
