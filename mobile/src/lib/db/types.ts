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

/**
 * The two kinds of collection a listening run can belong to.
 *
 * A folder is not a row anywhere the listener can own — it is a `folder_key`
 * derived from a file path — while a playlist is a first-class, syncable
 * entity. They share a run table because the *question* is the same for both
 * ("how far through this collection am I?") and answering it twice would let
 * the two answers drift.
 */
export type ContextType = "playlist" | "folder";

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
  /**
   * How many times the folder has been played as a collection, and how many of
   * those runs reached the end. Derived from `context_plays` rather than stored
   * on the row, because most folders have no `folders` row at all.
   */
  playCount: number;
  completedPlayCount: number;
  /**
   * Cover art of the folder's first track, so a folder card shows the book it
   * holds rather than a letter. Null when nothing inside has artwork — a folder
   * has no picture of its own, and inventing one would be a lie.
   */
  artworkUrl: string | null;
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
  /**
   * The collection run this session was part of, if any. Null for a track
   * played on its own — which is a real answer, not missing data: it is what
   * makes "the playlist has been heard through twice" countable.
   */
  contextPlayId: string | null;
  /** Denormalised from the run so the History list needs no join. */
  contextType: ContextType | null;
  contextKey: string | null;
  /**
   * The continuous listen this session is part of.
   *
   * Every track heard without a break shares one id: automatic progression
   * keeps it, a deliberate move to another track starts a new one. This is the
   * level the History list shows, because "which track did the listener start
   * on, and where did they stop?" is a question about the stretch, not about
   * any one track in it.
   */
  stretchId: string;
  /**
   * Whether the listener scrubbed while this track was playing.
   *
   * A scrub is not a session boundary — it does not change what is being
   * listened to — but it does mean the stretch was not heard straight through,
   * which is what separates a complete listen from a merely finished one.
   */
  seeked: boolean;
};

/**
 * One run through a collection — the level above a session.
 *
 * "Listened to this playlist three times" is a fact about runs, not about
 * tracks: it takes many sessions to get through a playlist, and only the run
 * knows they were the same attempt. `finishedCount` and `listenedSec` are
 * derived from the run's own sessions when it is closed, so they cannot drift
 * from what the session rows say.
 */
export type LocalContextPlay = {
  /** Local id; doubles as the `clientId` used for idempotent sync. */
  id: string;
  serverId: string | null;
  contextType: ContextType;
  /** A local playlist id, or a folder key. */
  contextKey: string;
  /** Captured at play time, so a rename or delete cannot rewrite history. */
  contextTitle: string;
  /** Size of the queue when the run started; read as "9 of 24". */
  trackCount: number;
  startedAt: number;
  endedAt: number | null;
  /** Where the run was when it last moved on. */
  lastIndex: number;
  lastTrackId: string | null;
  lastPositionSec: number;
  listenedSec: number;
  finishedCount: number;
  /** The queue genuinely ran out — true however much was appended mid-run. */
  completed: boolean;
  interrupted: boolean;
  /** Local tombstone timestamp; non-null means pending server-side delete. */
  deletedAt: number | null;
  syncStatus: SyncStatus;
  createdAt: number;
  updatedAt: number;
};

/** A run's live figures, derived from its sessions rather than stored. */
export type ContextRunProgress = {
  finishedCount: number;
  listenedSec: number;
  sessionCount: number;
};

/** Totals for one collection, from `context_plays`. */
export type ContextStats = {
  playCount: number;
  completedPlayCount: number;
  listenedSec: number;
  lastPlayedAt: number | null;
  /** Best finished count of any single run — how close the listener got. */
  bestFinishedCount: number;
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
  /** The collection run this session belongs to, carried across a kill. */
  contextPlayId: string | null;
  /** The listening stretch this session belongs to, carried across a kill. */
  stretchId: string | null;
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
  contextPlays: number;
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
  /** The collection run this session belongs to, if the queue was one. */
  contextPlayId?: string | null;
  contextType?: ContextType | null;
  contextKey?: string | null;
  /** Defaults to the session's own id, which makes it a stretch of one. */
  stretchId?: string;
  seeked?: boolean;
};

export type CreateContextPlayInput = {
  id?: string;
  contextType: ContextType;
  contextKey: string;
  contextTitle: string;
  trackCount: number;
  startedAt: number;
  lastIndex?: number;
  lastTrackId?: string | null;
  lastPositionSec?: number;
};

/** Where a run got to, written as it moves from track to track. */
export type TouchContextPlayInput = {
  lastIndex: number;
  lastTrackId: string | null;
  lastPositionSec: number;
};

export type FinalizeContextPlayInput = {
  endedAt: number;
  completed: boolean;
  interrupted: boolean;
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
  contextPlayId?: string | null;
  stretchId?: string | null;
};
