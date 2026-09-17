import {
  mapAnnotation,
  mapCheckpoint,
  mapPlaylist,
  mapSession,
  mapTrack,
  parseJsonArray,
  parsePlaylistItems,
  toSyncStatus,
  type AnnotationRow,
  type CheckpointRow,
  type PlaylistRow,
  type SessionRow,
  type TrackRow,
} from "@/lib/db/mappers";

const base = { created_at: 1, updated_at: 2 };

describe("row mappers", () => {
  it("maps a track row, converting integers to booleans and statuses", () => {
    const row: TrackRow = {
      id: "t1",
      server_id: null,
      content_hash: "hash",
      title: "Title",
      file_name: null,
      file_uri: null,
      duration_sec: 3600,
      file_size_bytes: 1024,
      mime_type: null,
      is_audiobook: 1,
      author: null,
      narrator: null,
      artwork_url: null,
      total_play_count: 3,
      total_listen_time_sec: 120,
      last_played_at: 999,
      sync_status: "synced",
      source: null,
      source_uri: null,
      source_path: null,
      source_size: null,
      source_mtime: null,
      folder_key: null,
      folder_name: null,
      album: null,
      track_number: null,
      disc_number: null,
      year: null,
      availability: "present",
      ...base,
    };

    const track = mapTrack(row);
    expect(track.isAudiobook).toBe(true);
    expect(track.syncStatus).toBe("synced");
    expect(track.durationSec).toBe(3600);
    expect(track.lastPlayedAt).toBe(999);
  });

  it("maps a session row with nullable end fields", () => {
    const row: SessionRow = {
      id: "s1",
      server_id: null,
      track_id: "t1",
      content_hash: "hash",
      started_at: 100,
      ended_at: null,
      start_position_sec: 0,
      end_position_sec: null,
      duration_listened_sec: 0,
      playback_speed: 1.5,
      completed: 0,
      interrupted: 0,
      device_info: null,
      sync_status: "pending",
      ...base,
    };

    const session = mapSession(row);
    expect(session.endedAt).toBeNull();
    expect(session.endPositionSec).toBeNull();
    expect(session.playbackSpeed).toBe(1.5);
    expect(session.completed).toBe(false);
  });

  it("parses annotation tags from JSON and maps the delete tombstone", () => {
    const row: AnnotationRow = {
      id: "a1",
      server_id: null,
      track_id: "t1",
      content_hash: "hash",
      position_sec: 90,
      text: "note",
      tags: JSON.stringify(["important", "chapter"]),
      color: "#fff",
      times_played_before: 0,
      deleted_at: null,
      sync_status: "pending",
      ...base,
    };

    expect(mapAnnotation(row).tags).toEqual(["important", "chapter"]);
    expect(mapAnnotation(row).deletedAt).toBeNull();
    expect(mapAnnotation({ ...row, deleted_at: 1234 }).deletedAt).toBe(1234);
  });

  it("parses playlist items and drops malformed entries", () => {
    const row: PlaylistRow = {
      id: "p1",
      server_id: null,
      title: "Favorites",
      description: null,
      is_public: 0,
      items: JSON.stringify([
        { trackId: "t1", order: 0 },
        { trackId: 5, order: 1 },
      ]),
      deleted_at: null,
      sync_status: "pending",
      ...base,
    };

    expect(mapPlaylist(row).items).toEqual([{ trackId: "t1", order: 0 }]);
    expect(mapPlaylist(row).isPublic).toBe(false);
  });

  it("maps a checkpoint row", () => {
    const row: CheckpointRow = {
      id: "s1",
      session_id: "s1",
      track_id: "t1",
      content_hash: "hash",
      position_sec: 42,
      last_position_sec: 42,
      duration_listened_sec: 40,
      playback_speed: 1,
      started_at: 1,
      timestamp: 2,
      device_info: null,
    };

    expect(mapCheckpoint(row).sessionId).toBe("s1");
    expect(mapCheckpoint(row).positionSec).toBe(42);
  });
});

describe("pure parsers", () => {
  it("falls back to 'pending' for an unknown sync status", () => {
    expect(toSyncStatus("weird")).toBe("pending");
    expect(toSyncStatus("failed")).toBe("failed");
  });

  it("returns an empty array for invalid JSON", () => {
    expect(parseJsonArray("not json")).toEqual([]);
    expect(parseJsonArray('["ok"]')).toEqual(["ok"]);
    expect(parsePlaylistItems("{}")).toEqual([]);
  });
});
