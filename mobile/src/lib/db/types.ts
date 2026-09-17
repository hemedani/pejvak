export type SyncStatus = "pending" | "syncing" | "synced" | "failed";

/** Where a track's audio actually lives. */
export type TrackSource =
  /** Discovered through the Android media index; referenced by `content://` URI. */
  | "mediastore"
  /** Inside a folder the user granted access to; referenced by tree/document URI. */
  | "saf"
  /** Handed to us by the document picker, with only a transient read grant. */
  | "picker";

/**
 * Whether the bytes are still where we left them. Only referenced tracks can go
 * missing — a copied track is inside app storage and cannot be moved by anyone else.
 */
export type TrackAvailability = "present" | "missing";

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
  /** Null on rows imported before device scanning existed. */
  source: TrackSource | null;
  /** The URI handed to the player. `content://` for MediaStore, `file://` otherwise. */
  sourceUri: string | null;
  /** Filesystem path when one is known; the folder key is derived from this. */
  sourcePath: string | null;
  /** Size of the device-side original when it was last identified. */
  sourceSize: number | null;
  /** Modification time of the device-side original when it was last identified. */
  sourceMtime: number | null;
  /** Normalised, root-stripped container path, e.g. `Lectures/Physics`. */
  folderKey: string | null;
  /** Display name of the containing folder, e.g. `Physics`. */
  folderName: string | null;
  album: string | null;
  trackNumber: number | null;
  discNumber: number | null;
  year: number | null;
  availability: TrackAvailability;
};

/** A container the user has access to. `treeUri` persists the SAF grant. */
export type LocalFolder = {
  key: string;
  name: string;
  treeUri: string | null;
  addedAt: number;
  lastPlayedAt: number | null;
};

export type FolderSummary = LocalFolder & {
  trackCount: number;
  finishedCount: number;
  totalDurationSec: number;
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
  /** Local id; doubles as the `clientId` used for idempotent sync. */
  id: string;
  serverId: string | null;
  title: string;
  description: string | null;
  isPublic: boolean;
  items: PlaylistItem[];
  /** Local tombstone timestamp; non-null means pending server-side delete. */
  deletedAt: number | null;
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

/** Rows waiting to sync, per table. */
export type PendingCounts = {
  tracks: number;
  sessions: number;
  annotations: number;
  playlists: number;
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
  source?: TrackSource | null;
  sourceUri?: string | null;
  sourcePath?: string | null;
  sourceSize?: number | null;
  sourceMtime?: number | null;
  folderKey?: string | null;
  folderName?: string | null;
  album?: string | null;
  trackNumber?: number | null;
  discNumber?: number | null;
  year?: number | null;
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

export type InsertRemotePlaylistInput = {
  /** Local id: the server `clientId`, or the server id when none exists. */
  id: string;
  serverId: string;
  title: string;
  description: string | null;
  isPublic: boolean;
  /** Items already resolved to local track ids via the track serverId map. */
  items: PlaylistItem[];
  updatedAt: number;
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
