import { openDatabaseAsync, type SQLiteDatabase } from "expo-sqlite";

import { LATEST_SCHEMA_VERSION, MIGRATIONS } from "@/lib/db/migrations";

export const DATABASE_NAME = "pejvak.db";

let databasePromise: Promise<SQLiteDatabase> | null = null;

async function readSchemaVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  return row?.user_version ?? 0;
}

async function migrate(db: SQLiteDatabase): Promise<void> {
  let current = await readSchemaVersion(db);
  if (current >= LATEST_SCHEMA_VERSION) {
    return;
  }

  for (const migration of MIGRATIONS) {
    if (migration.version <= current) {
      continue;
    }
    await db.withExclusiveTransactionAsync(async (txn) => {
      for (const statement of migration.up) {
        await txn.execAsync(statement);
      }
    });
    // Bump the version only after the migration transaction commits. Re-running
    // CREATE TABLE IF NOT EXISTS on a crash is safe and idempotent.
    await db.execAsync(`PRAGMA user_version = ${migration.version}`);
    current = migration.version;
  }
}

export function getDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const db = await openDatabaseAsync(DATABASE_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL");
      await db.execAsync("PRAGMA foreign_keys = ON");
      await migrate(db);
      return db;
    })().catch((error: unknown) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}
