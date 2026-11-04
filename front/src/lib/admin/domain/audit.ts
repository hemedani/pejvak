/**
 * The operator activity feed.
 *
 * `metadata` stays a JSON string in the wire so an old row with a retired
 * action cannot break the read (see the backend comment). It is parsed here
 * for display and never treated as a stable schema — a surface that reads one
 * field out of it would break the first time an action is renamed.
 */

import { asRecord, asString, asTimestamp } from "@/lib/parse";

export type AdminAuditLog = {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  actorRole: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  summary: string | null;
  metadata: string | null;
  createdAt: number | null;
};

export type MetadataEntry = { key: string; value: string };

export const AUDIT_GET = {
  _id: 1,
  actorId: 1,
  actorEmail: 1,
  actorRole: 1,
  action: 1,
  targetType: 1,
  targetId: 1,
  summary: 1,
  metadata: 1,
  createdAt: 1,
} as const;

export function parseAuditLog(raw: unknown): AdminAuditLog | null {
  const record = asRecord(raw);
  const id = asString(record?._id);
  const action = asString(record?.action);

  if (!record || !id || !action) {
    return null;
  }

  return {
    id,
    actorId: asString(record.actorId),
    actorEmail: asString(record.actorEmail),
    actorRole: asString(record.actorRole),
    action,
    targetType: asString(record.targetType),
    targetId: asString(record.targetId),
    summary: asString(record.summary),
    metadata: asString(record.metadata),
    createdAt: asTimestamp(record.createdAt),
  };
}

/**
 * Display entries from the audit metadata.
 *
 * A malformed or retired payload is an empty list, not an error: the feed must
 * still show the action, its actor and its time.
 */
export function metadataEntries(raw: unknown): MetadataEntry[] {
  let value: unknown = raw;

  if (typeof raw === "string") {
    if (raw.trim() === "") {
      return [];
    }
    try {
      value = JSON.parse(raw);
    } catch {
      return [];
    }
  }

  const record = asRecord(value);

  if (!record) {
    return [];
  }

  return Object.entries(record)
    .filter(([, entry]) => entry !== null && entry !== undefined)
    .map(([key, entry]) => ({
      key,
      value: typeof entry === "string" ? entry : JSON.stringify(entry),
    }));
}
