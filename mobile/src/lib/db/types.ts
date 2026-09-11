export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

export type PlaylistItem = {
  trackId: string;
  order: number;
};

export type LocalTrack = {
  id: string;
  serverId: string | null;
  contentHash: string;
  title: string;
  fileName: string | null;
  fileUri: string | null;
  durationSec: number;
  fileSizeBytes: number;
  mimeType: string | null;
  isAudiobook: boolean;
  author: string | null;
  narrator: string | null;
  artworkUrl: string | null;
  totalPlayCount: number;
  totalListenTimeSec: number;
  lastPlayedAt: number | null;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
};

export type LocalSession = {
  /** Local id; doubles as the `clientId` used for idempotent sync. */
  id: string;
  serverId: string | null;
  trackId: string;
  contentHash: string;
  startedAt: number;
  endedAt: number | null;
  startPositionSec: number;
  endPositionSec: number | null;
  durationListenedSec: number;
  playbackSpeed: number;
  completed: boolean;
  interrupted: boolean;
  deviceInfo: string | null;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
};

export type LocalAnnotation = {
  /** Local id; doubles as the `clientId` used for idempotent sync. */
  id: string;
  serverId: string | null;
  trackId: string;
  contentHash: string;
  positionSec: number;
  text: string;
  tags: string[];
  color: string | null;
  timesPlayedBefore: number;
  /** Local tombstone timestamp; non-null means pending server-side delete. */
  deletedAt: number | null;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
};

export type LocalPlaylist = {
  id: string;
  serverId: string | null;
  title: string;
  description: string | null;
  isPublic: boolean;
  items: PlaylistItem[];
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
};

/** Local-only kill-recovery row; never synced. */
export type PlaybackCheckpoint = {
  id: string;
  sessionId: string;
  trackId: string;
  contentHash: string;
  positionSec: number;
  lastPositionSec: number;
  durationListenedSec: number;
  playbackSpeed: number;
  startedAt: number;
  timestamp: number;
  deviceInfo: string | null;
};

/** Everything the Track Detail screen needs, read locally. */
export type TrackDetailData = {
  track: LocalTrack;
  sessions: LocalSession[];
  annotations: LocalAnnotation[];
};

export type CreateTrackInput = {
  id?: string;
  contentHash: string;
  title: string;
  fileName?: string | null;
  fileUri?: string | null;
  durationSec: number;
  fileSizeBytes: number;
  mimeType?: string | null;
  isAudiobook?: boolean;
  author?: string | null;
  narrator?: string | null;
  artworkUrl?: string | null;
};

export type CreateSessionInput = {
  id?: string;
  trackId: string;
  contentHash: string;
  startedAt: number;
  startPositionSec: number;
  playbackSpeed: number;
  deviceInfo?: string | null;
  endedAt?: number | null;
  endPositionSec?: number | null;
  durationListenedSec?: number;
  completed?: boolean;
  interrupted?: boolean;
};

export type FinalizeSessionInput = {
  endedAt: number;
  endPositionSec: number;
  durationListenedSec: number;
  completed: boolean;
  interrupted: boolean;
};

export type CreateAnnotationInput = {
  id?: string;
  trackId: string;
  contentHash: string;
  positionSec: number;
  text: string;
  tags?: string[];
  color?: string | null;
  timesPlayedBefore?: number;
};

export type CreatePlaylistInput = {
  id?: string;
  title: string;
  description?: string | null;
  isPublic?: boolean;
  items?: PlaylistItem[];
};

export type SaveCheckpointInput = {
  sessionId: string;
  trackId: string;
  contentHash: string;
  positionSec: number;
  lastPositionSec: number;
  durationListenedSec: number;
  playbackSpeed: number;
  startedAt: number;
  timestamp: number;
  deviceInfo?: string | null;
};
