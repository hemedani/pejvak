/**
 * The Library's Recent tab.
 *
 * The rule under test is the one the listener asked for: an entry that came from
 * a playlist or a folder shows up *as that collection*, not as the track it
 * happened to be playing. That is a fact only a session knows, so every case
 * here is built out of sessions rather than out of `last_played_at` stamps.
 */

import type { FolderSummary, LocalPlaylist, LocalTrack } from "@/lib/db/types";
import type { HistoryItem } from "@/lib/history";
import { buildRecentPlays, describeRecentWhen, recentPlayKey } from "@/lib/recentPlays";

const NOW = 1_700_000_000_000;

function track(id: string): LocalTrack {
  return {
    id,
    serverId: null,
    contentHash: `hash-${id}`,
    title: `Track ${id}`,
    fileName: `${id}.mp3`,
    fileUri: `file:///${id}.mp3`,
    durationSec: 600,
    fileSizeBytes: 0,
    mimeType: null,
    isAudiobook: true,
    author: null,
    narrator: null,
    artworkUrl: null,
    totalPlayCount: 0,
    totalListenTimeSec: 0,
    lastPlayedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
    source: "saf",
    sourceUri: `content:///${id}.mp3`,
    sourcePath: `/storage/${id}.mp3`,
    sourceSize: null,
    sourceMtime: null,
    folderKey: "Lectures",
    folderName: "Lectures",
    album: null,
    trackNumber: null,
    discNumber: null,
    year: null,
    availability: "present",
  };
}

function folder(key: string): FolderSummary {
  return {
    key,
    name: key,
    treeUri: null,
    addedAt: 0,
    lastPlayedAt: null,
    trackCount: 4,
    finishedCount: 1,
    totalDurationSec: 2400,
    playCount: 2,
    completedPlayCount: 0,
    artworkUrl: null,
  };
}

function playlist(id: string, title: string): LocalPlaylist {
  return {
    id,
    serverId: null,
    title,
    description: null,
    isPublic: false,
    items: [],
    deletedAt: null,
    syncStatus: "pending",
    createdAt: 0,
    updatedAt: 0,
  };
}

type ItemInput = {
  sessionId: string;
  trackId: string;
  startedAt: number;
  contextType?: "folder" | "playlist" | null;
  contextKey?: string | null;
};

function item({
  sessionId,
  trackId,
  startedAt,
  contextType = null,
  contextKey = null,
}: ItemInput): HistoryItem {
  return {
    session: {
      id: sessionId,
      serverId: null,
      trackId,
      contentHash: `hash-${trackId}`,
      startedAt,
      endedAt: startedAt + 60_000,
      startPositionSec: 0,
      endPositionSec: 60,
      durationListenedSec: 60,
      playbackSpeed: 1,
      completed: false,
      interrupted: false,
      deviceInfo: null,
      contextPlayId: contextType ? `run-${sessionId}` : null,
      contextType,
      contextKey,
      stretchId: sessionId,
      seeked: false,
      syncStatus: "pending",
      createdAt: 0,
      updatedAt: 0,
    },
    track: {
      id: trackId,
      title: `Track ${trackId}`,
      author: null,
      contentHash: `hash-${trackId}`,
      isAudiobook: true,
      artworkUrl: null,
    },
    contextTitle: contextType ? contextKey : null,
  };
}

const ALL_TRACKS = ["t1", "t2", "t3"].map(track);
const LECTURES = folder("Lectures");
const MIX = playlist("pl-1", "Morning mix");

function build(items: HistoryItem[], limit = 12, folders = [LECTURES], playlists = [MIX]) {
  return buildRecentPlays({
    items,
    folders,
    playlists,
    tracks: ALL_TRACKS,
    limit,
  });
}

describe("what the Recent list shows", () => {
  it("shows a folder play as the folder, not as the track it was playing", () => {
    const recent = build([
      item({
        sessionId: "s1",
        trackId: "t1",
        startedAt: NOW,
        contextType: "folder",
        contextKey: "Lectures",
      }),
    ]);

    expect(recent).toHaveLength(1);
    expect(recent[0].kind).toBe("folder");
    expect(recent[0].kind === "folder" && recent[0].folder.key).toBe("Lectures");
    expect(recent[0].lastPlayedAt).toBe(NOW);
  });

  it("shows a playlist play as the playlist", () => {
    const recent = build([
      item({
        sessionId: "s1",
        trackId: "t2",
        startedAt: NOW,
        contextType: "playlist",
        contextKey: "pl-1",
      }),
    ]);

    expect(recent).toHaveLength(1);
    expect(recent[0].kind).toBe("playlist");
    expect(recent[0].kind === "playlist" && recent[0].playlist.title).toBe("Morning mix");
  });

  it("shows a track played on its own as that track", () => {
    const recent = build([item({ sessionId: "s1", trackId: "t3", startedAt: NOW })]);

    expect(recent).toHaveLength(1);
    expect(recent[0].kind).toBe("track");
    expect(recent[0].kind === "track" && recent[0].track.id).toBe("t3");
  });

  it("collapses a whole folder's worth of sessions into one row", () => {
    // Newest first, as the query returns them: three tracks of one listen.
    const recent = build([
      item({ sessionId: "s3", trackId: "t3", startedAt: NOW, contextType: "folder", contextKey: "Lectures" }),
      item({ sessionId: "s2", trackId: "t2", startedAt: NOW - 60_000, contextType: "folder", contextKey: "Lectures" }),
      item({ sessionId: "s1", trackId: "t1", startedAt: NOW - 120_000, contextType: "folder", contextKey: "Lectures" }),
    ]);

    expect(recent).toHaveLength(1);
    // The *most recent* play of the folder is what dates the row.
    expect(recent[0].lastPlayedAt).toBe(NOW);
  });

  it("puts a later standalone track above the folder played before it", () => {
    const recent = build([
      item({ sessionId: "s2", trackId: "t3", startedAt: NOW }),
      item({
        sessionId: "s1",
        trackId: "t1",
        startedAt: NOW - 600_000,
        contextType: "folder",
        contextKey: "Lectures",
      }),
    ]);

    expect(recent.map(recentPlayKey)).toEqual(["track:t3", "folder:Lectures"]);
  });

  it("keeps a track and a folder that contains it as two separate rows", () => {
    // Hearing a file on its own and hearing it inside its folder are different
    // things to want back, so they must not collapse into one entry.
    const recent = build([
      item({ sessionId: "s2", trackId: "t1", startedAt: NOW }),
      item({
        sessionId: "s1",
        trackId: "t1",
        startedAt: NOW - 600_000,
        contextType: "folder",
        contextKey: "Lectures",
      }),
    ]);

    expect(recent.map(recentPlayKey)).toEqual(["track:t1", "folder:Lectures"]);
  });

  it("falls through to the track when the folder it came from is gone", () => {
    const recent = build(
      [
        item({
          sessionId: "s1",
          trackId: "t1",
          startedAt: NOW,
          contextType: "folder",
          contextKey: "Deleted",
        }),
      ],
      12,
      [],
    );

    expect(recent).toHaveLength(1);
    expect(recent[0].kind).toBe("track");
  });

  it("falls through to the track when the playlist it came from was deleted", () => {
    const recent = build(
      [
        item({
          sessionId: "s1",
          trackId: "t2",
          startedAt: NOW,
          contextType: "playlist",
          contextKey: "pl-gone",
        }),
      ],
      12,
      [LECTURES],
      [],
    );

    expect(recent).toHaveLength(1);
    expect(recent[0].kind).toBe("track");
  });

  it("drops a session whose track has left the library", () => {
    const recent = build([item({ sessionId: "s1", trackId: "t-gone", startedAt: NOW })]);

    expect(recent).toEqual([]);
  });

  it("stops at the limit", () => {
    const recent = build(
      [
        item({ sessionId: "s1", trackId: "t1", startedAt: NOW }),
        item({ sessionId: "s2", trackId: "t2", startedAt: NOW - 1000 }),
        item({ sessionId: "s3", trackId: "t3", startedAt: NOW - 2000 }),
      ],
      2,
    );

    expect(recent.map(recentPlayKey)).toEqual(["track:t1", "track:t2"]);
  });
});

describe("how long ago it was", () => {
  it("names the recent past in the shortest true unit", () => {
    expect(describeRecentWhen(NOW - 5_000, NOW)).toBe("Just now");
    expect(describeRecentWhen(NOW - 12 * 60_000, NOW)).toBe("12m ago");
    expect(describeRecentWhen(NOW - 3 * 3_600_000, NOW)).toBe("3h ago");
    expect(describeRecentWhen(NOW - 26 * 3_600_000, NOW)).toBe("Yesterday");
    expect(describeRecentWhen(NOW - 3 * 86_400_000, NOW)).toBe("3d ago");
  });

  it("falls back to a date once a week has passed", () => {
    const old = new Date(NOW - 40 * 86_400_000);
    expect(describeRecentWhen(old.getTime(), NOW)).toBe(old.toLocaleDateString());
  });

  it("does not report a future timestamp as negative", () => {
    expect(describeRecentWhen(NOW + 60_000, NOW)).toBe("Just now");
  });
});
