/**
 * Operator-facing accounts.
 *
 * The list row is whatever `adminListUsers` can compute; the detail act is the
 * only place a listener's entitlement is read as an operator. `role` and
 * `status` fail closed here for the same reason they do in `domain/user.ts`:
 * a legacy account with no role is a listener, never an operator.
 */

import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asTimestamp,
} from "@/lib/parse";
import { asRole, asStatus, type UserRole, type UserStatus } from "@/lib/domain/user";

import { parseLimits, type PlanLimits } from "./plans";

export type SubscriptionHint = {
  planCode: string;
  status: string;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
};

export type UserUsage = {
  sessionCount: number;
  listenTimeSec: number;
  firstActiveAt: number | null;
  lastActiveAt: number | null;
  trackCount: number;
  storageBytes: number;
  annotationCount: number;
  playlistCount: number;
  contextCount: number;
  onlineCollectionCount: number;
};

export type AdminUser = {
  id: string;
  username: string;
  email: string;
  displayName: string | null;
  role: UserRole;
  status: UserStatus;
  suspendedAt: number | null;
  suspendedReason: string | null;
  createdAt: number | null;
  updatedAt: number | null;
  planCode: string | null;
  subscription: SubscriptionHint | null;
  usage: UserUsage;
};

export type Entitlement = {
  planCode: string | null;
  planTitle: string | null;
  isPaid: boolean;
  limits: PlanLimits;
  subscriptionStatus: string | null;
  currentPeriodEnd: number | null;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
};

export type HistoryQuota = {
  limit: number | null;
  used: number;
  remaining: number | null;
  unlimited: boolean;
};

export type UserSessionRow = {
  id: string;
  contentHash: string | null;
  startedAt: number | null;
  endedAt: number | null;
  durationListenedSec: number | null;
  startPositionSec: number | null;
  endPositionSec: number | null;
  playbackSpeed: number | null;
  completed: boolean;
  interrupted: boolean;
  seeked: boolean;
  deviceInfo: string | null;
  contextType: string | null;
  trackTitle: string | null;
};

export type UserDetail = {
  user: AdminUser;
  entitlement: Entitlement | null;
  historyQuota: HistoryQuota | null;
  usage: UserUsage;
  recentSessions: UserSessionRow[];
};

export const USER_ROW_GET = {
  _id: 1,
  username: 1,
  email: 1,
  displayName: 1,
  role: 1,
  status: 1,
  suspendedAt: 1,
  suspendedReason: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;

export const USER_DETAIL_GET = {
  user: {
    _id: 1,
    username: 1,
    email: 1,
    displayName: 1,
    role: 1,
    status: 1,
    suspendedAt: 1,
    suspendedReason: 1,
    createdAt: 1,
    updatedAt: 1,
  },
  entitlement: {
    planCode: 1,
    planTitle: 1,
    isPaid: 1,
    limits: {
      historyEntries: 1,
      crossDeviceSync: 1,
      playlists: 1,
      maxTracks: 1,
      aiCreditsPerMonth: 1,
    },
    subscriptionStatus: 1,
    currentPeriodEnd: 1,
    cancelAtPeriodEnd: 1,
    autoRenew: 1,
  },
  historyQuota: { limit: 1, used: 1, remaining: 1, unlimited: 1 },
  usage: {
    sessionCount: 1,
    listenTimeSec: 1,
    firstActiveAt: 1,
    lastActiveAt: 1,
    trackCount: 1,
    storageBytes: 1,
    annotationCount: 1,
    playlistCount: 1,
    contextCount: 1,
    onlineCollectionCount: 1,
  },
  recentSessions: {
    _id: 1,
    contentHash: 1,
    startedAt: 1,
    endedAt: 1,
    startPositionSec: 1,
    endPositionSec: 1,
    durationListenedSec: 1,
    playbackSpeed: 1,
    completed: 1,
    interrupted: 1,
    seeked: 1,
    deviceInfo: 1,
    contextType: 1,
    track: { title: 1 },
  },
} as const;

export const USER_HISTORY_GET = {
  _id: 1,
  contentHash: 1,
  startedAt: 1,
  endedAt: 1,
  startPositionSec: 1,
  endPositionSec: 1,
  durationListenedSec: 1,
  playbackSpeed: 1,
  completed: 1,
  interrupted: 1,
  seeked: 1,
  contextType: 1,
  track: { title: 1 },
} as const;

function parseUsage(raw: unknown): UserUsage {
  const record = asRecord(raw);

  return {
    sessionCount: asNumber(record?.sessionCount) ?? 0,
    listenTimeSec: asNumber(record?.listenTimeSec) ?? 0,
    firstActiveAt: asTimestamp(record?.firstActiveAt),
    lastActiveAt: asTimestamp(record?.lastActiveAt),
    trackCount: asNumber(record?.trackCount) ?? 0,
    storageBytes: asNumber(record?.storageBytes) ?? 0,
    annotationCount: asNumber(record?.annotationCount) ?? 0,
    playlistCount: asNumber(record?.playlistCount) ?? 0,
    contextCount: asNumber(record?.contextCount) ?? 0,
    onlineCollectionCount: asNumber(record?.onlineCollectionCount) ?? 0,
  };
}

function parseSubscriptionHint(raw: unknown): SubscriptionHint | null {
  const record = asRecord(raw);
  const planCode = asString(record?.planCode);

  if (!record || !planCode) {
    return null;
  }

  return {
    planCode,
    status: asString(record.status) ?? "unknown",
    currentPeriodEnd: asTimestamp(record.currentPeriodEnd),
    cancelAtPeriodEnd: asBoolean(record.cancelAtPeriodEnd),
  };
}

export function parseUserRow(raw: unknown): AdminUser | null {
  const record = asRecord(raw);
  const id = asString(record?._id);

  if (!record || !id) {
    return null;
  }

  return {
    id,
    username: asString(record.username) ?? "",
    email: asString(record.email) ?? "",
    displayName: asString(record.displayName),
    role: asRole(record.role),
    status: asStatus(record.status),
    suspendedAt: asTimestamp(record.suspendedAt),
    suspendedReason: asString(record.suspendedReason),
    createdAt: asTimestamp(record.createdAt),
    updatedAt: asTimestamp(record.updatedAt),
    planCode: asString(record.planCode),
    subscription: parseSubscriptionHint(record.subscription),
    usage: parseUsage(record.usage),
  };
}

export function parseUserHistoryRow(raw: unknown): UserSessionRow | null {
  const record = asRecord(raw);
  const id = asString(record?._id);

  if (!record || !id) {
    return null;
  }

  return {
    id,
    contentHash: asString(record.contentHash),
    startedAt: asTimestamp(record.startedAt),
    endedAt: asTimestamp(record.endedAt),
    durationListenedSec: asNumber(record.durationListenedSec),
    startPositionSec: asNumber(record.startPositionSec),
    endPositionSec: asNumber(record.endPositionSec),
    playbackSpeed: asNumber(record.playbackSpeed),
    completed: asBoolean(record.completed),
    interrupted: asBoolean(record.interrupted),
    seeked: asBoolean(record.seeked),
    deviceInfo: asString(record.deviceInfo),
    contextType: asString(record.contextType),
    trackTitle: asString(asRecord(record.track)?.title),
  };
}

function parseEntitlement(raw: unknown): Entitlement | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  return {
    planCode: asString(record.planCode),
    planTitle: asString(record.planTitle),
    isPaid: asBoolean(record.isPaid),
    limits: parseLimits(record.limits),
    subscriptionStatus: asString(record.subscriptionStatus),
    currentPeriodEnd: asTimestamp(record.currentPeriodEnd),
    cancelAtPeriodEnd: asBoolean(record.cancelAtPeriodEnd),
    autoRenew: asBoolean(record.autoRenew),
  };
}

function parseHistoryQuota(raw: unknown): HistoryQuota | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const limit = asNumber(record.limit);

  return {
    limit,
    used: asNumber(record.used) ?? 0,
    remaining: asNumber(record.remaining),
    unlimited: limit === -1 || asBoolean(record.unlimited),
  };
}

export function parseUserDetail(raw: unknown): UserDetail | null {
  const record = asRecord(raw);
  const user = parseUserRow(record?.user);

  if (!record || !user) {
    return null;
  }

  return {
    user,
    entitlement: parseEntitlement(record.entitlement),
    historyQuota: parseHistoryQuota(record.historyQuota),
    usage: parseUsage(record.usage),
    recentSessions: asArray(record.recentSessions)
      .map(parseUserHistoryRow)
      .filter((session): session is UserSessionRow => session !== null),
  };
}
