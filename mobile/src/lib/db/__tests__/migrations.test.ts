import { LATEST_SCHEMA_VERSION, MIGRATIONS } from "@/lib/db/migrations";

const REQUIRED_TABLES = [
  "tracks",
  "sessions",
  "annotations",
  "playlists",
  "playback_checkpoints",
  "settings",
];

function allSql(): string {
  return MIGRATIONS.flatMap((migration) => migration.up).join("\n");
}

function columnType(table: string, column: string): string | null {
  const match = allSql().match(
    new RegExp(`${table} \\(([\\s\\S]*?)\\)`, "i"),
  );
  if (!match) {
    return null;
  }
  const line = match[1]
    .split("\n")
    .map((part) => part.trim().replace(/,$/, ""))
    .find((part) => part.startsWith(column));
  if (!line) {
    return null;
  }
  return line.split(/\s+/)[1] ?? null;
}

describe("schema migrations", () => {
  it("starts at version 1 and increases by one", () => {
    const versions = MIGRATIONS.map((migration) => migration.version);
    expect(versions[0]).toBe(1);
    versions.forEach((version, index) => {
      expect(version).toBe(index + 1);
    });
    expect(LATEST_SCHEMA_VERSION).toBe(versions.length);
  });

  it("creates every required table", () => {
    for (const table of REQUIRED_TABLES) {
      expect(allSql()).toMatch(new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`, "i"));
    }
  });

  it("stores all positions and durations as INTEGER seconds", () => {
    expect(columnType("tracks", "duration_sec")).toBe("INTEGER");
    expect(columnType("sessions", "start_position_sec")).toBe("INTEGER");
    expect(columnType("sessions", "end_position_sec")).toBe("INTEGER");
    expect(columnType("sessions", "duration_listened_sec")).toBe("INTEGER");
    expect(columnType("annotations", "position_sec")).toBe("INTEGER");
    expect(columnType("playback_checkpoints", "position_sec")).toBe("INTEGER");
    expect(columnType("playback_checkpoints", "last_position_sec")).toBe("INTEGER");
  });

  it("identifies tracks by a unique content_hash", () => {
    expect(allSql()).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS idx_tracks_content_hash/i);
  });

  it("gives syncable tables a sync_status defaulting to pending", () => {
    for (const table of ["tracks", "sessions", "annotations", "playlists"]) {
      expect(allSql()).toMatch(
        new RegExp(`${table} \\([\\s\\S]*?sync_status TEXT NOT NULL DEFAULT 'pending'`, "i"),
      );
    }
  });

  it("adds an annotation delete tombstone column at version 2", () => {
    const v2 = MIGRATIONS.find((migration) => migration.version === 2);
    expect(v2).toBeDefined();
    expect(v2!.up.join("\n")).toMatch(
      /ALTER TABLE annotations ADD COLUMN deleted_at INTEGER/i,
    );
  });

  it("adds a session delete tombstone column at version 5", () => {
    const v5 = MIGRATIONS.find((migration) => migration.version === 5);
    expect(v5).toBeDefined();
    expect(v5!.up.join("\n")).toMatch(
      /ALTER TABLE sessions ADD COLUMN deleted_at INTEGER/i,
    );
  });
});
