/**
 * Platform analytics.
 *
 * Every figure is the server's aggregation of the rows that define it; nothing
 * here is recomputed from a second source. A missing number becomes `null` (an
 * em dash on the page) rather than `0`, because zero is a fact and absence is
 * not one.
 *
 * `adminGetTopTracks` is not paged: it returns a ranked `rows` array inside a
 * `{ days, rows }` object, not the admin list wrapper.
 */

import {
  asArray,
  asBoolean,
  asNumber,
  asRecord,
  asString,
  asTimestamp,
} from "@/lib/parse";

export type OverviewUsers = {
  total: number;
  active: number;
  suspended: number;
  newLast24h: number;
  newLast7d: number;
  newLast30d: number;
};

export type OverviewActivity = {
  activeLast24h: number;
  activeLast7d: number;
  activeLast30d: number;
};

export type OverviewContent = {
  sessions: number;
  listenTimeSec: number;
  lastSessionAt: number | null;
  tracks: number;
  storageBytes: number;
  annotations: number;
  playlists: number;
  contexts: number;
  onlineCollections: number;
};

export type PlanDistributionRow = {
  planCode: string;
  title: string | null;
  priceCents: number;
  isActive: boolean;
  users: number;
};

export type OverviewRevenue = {
  mrrCents: number;
  currency: string;
  payingUsers: number;
  arpuCents: number;
  conversionRate: number;
  planDistribution: PlanDistributionRow[];
};

export type OverviewQuota = {
  freeHistoryLimit: number;
  usersAtLimit: number;
};

export type AdminOverview = {
  generatedAt: number | null;
  users: OverviewUsers;
  activity: OverviewActivity;
  content: OverviewContent;
  revenue: OverviewRevenue;
  quota: OverviewQuota;
};

export type TimeseriesPoint = {
  date: string;
  timestamp: number;
  signups: number;
  sessions: number;
  listenTimeSec: number;
  activeUsers: number;
};

export type AdminTimeseries = {
  days: TimeseriesPoint[];
  from: number | null;
  to: number | null;
};

export type TopTrack = {
  trackId: string | null;
  contentHash: string | null;
  title: string;
  author: string | null;
  isAudiobook: boolean;
  origin: string;
  listenTimeSec: number;
  playCount: number;
  listenerCount: number;
};

export type AdminTopTracks = {
  days: number;
  rows: TopTrack[];
};

export type RetentionWeek = {
  week: number;
  activeUsers: number;
  rate: number;
};

export type RetentionCohort = {
  cohortStart: number;
  cohortDate: string;
  size: number;
  weeks: RetentionWeek[];
};

export type AdminRetention = {
  cohorts: RetentionCohort[];
  weeks: number;
};

export const OVERVIEW_GET = {
  generatedAt: 1,
  users: {
    total: 1,
    active: 1,
    suspended: 1,
    newLast24h: 1,
    newLast7d: 1,
    newLast30d: 1,
  },
  activity: { activeLast24h: 1, activeLast7d: 1, activeLast30d: 1 },
  content: {
    sessions: 1,
    listenTimeSec: 1,
    lastSessionAt: 1,
    tracks: 1,
    storageBytes: 1,
    annotations: 1,
    playlists: 1,
    contexts: 1,
    onlineCollections: 1,
  },
  revenue: {
    mrrCents: 1,
    currency: 1,
    payingUsers: 1,
    arpuCents: 1,
    conversionRate: 1,
    planDistribution: {
      planCode: 1,
      title: 1,
      priceCents: 1,
      isActive: 1,
      users: 1,
    },
  },
  quota: { freeHistoryLimit: 1, usersAtLimit: 1 },
} as const;

export const TIMESERIES_GET = {
  days: {
    date: 1,
    timestamp: 1,
    signups: 1,
    sessions: 1,
    listenTimeSec: 1,
    activeUsers: 1,
  },
  from: 1,
  to: 1,
} as const;

export const TOP_TRACKS_GET = {
  days: 1,
  rows: {
    trackId: 1,
    contentHash: 1,
    title: 1,
    author: 1,
    isAudiobook: 1,
    origin: 1,
    listenTimeSec: 1,
    playCount: 1,
    listenerCount: 1,
  },
} as const;

export const RETENTION_GET = {
  cohorts: {
    cohortStart: 1,
    cohortDate: 1,
    size: 1,
    weeks: { week: 1, activeUsers: 1, rate: 1 },
  },
  weeks: 1,
} as const;

const num = (value: unknown): number => asNumber(value) ?? 0;

export function parseOverview(raw: unknown): AdminOverview | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const users = asRecord(record.users);
  const activity = asRecord(record.activity);
  const content = asRecord(record.content);
  const revenue = asRecord(record.revenue);
  const quota = asRecord(record.quota);

  const planDistribution = asArray(revenue?.planDistribution)
    .map((item) => {
      const row = asRecord(item);
      const planCode = asString(row?.planCode);

      if (!row || !planCode) {
        return null;
      }

      return {
        planCode,
        title: asString(row.title),
        priceCents: num(row.priceCents),
        isActive: row.isActive !== false,
        users: num(row.users),
      };
    })
    .filter((row): row is PlanDistributionRow => row !== null);

  return {
    generatedAt: asTimestamp(record.generatedAt),
    users: {
      total: num(users?.total),
      active: num(users?.active),
      suspended: num(users?.suspended),
      newLast24h: num(users?.newLast24h),
      newLast7d: num(users?.newLast7d),
      newLast30d: num(users?.newLast30d),
    },
    activity: {
      activeLast24h: num(activity?.activeLast24h),
      activeLast7d: num(activity?.activeLast7d),
      activeLast30d: num(activity?.activeLast30d),
    },
    content: {
      sessions: num(content?.sessions),
      listenTimeSec: num(content?.listenTimeSec),
      lastSessionAt: asTimestamp(content?.lastSessionAt),
      tracks: num(content?.tracks),
      storageBytes: num(content?.storageBytes),
      annotations: num(content?.annotations),
      playlists: num(content?.playlists),
      contexts: num(content?.contexts),
      onlineCollections: num(content?.onlineCollections),
    },
    revenue: {
      mrrCents: num(revenue?.mrrCents),
      currency: asString(revenue?.currency) ?? "USD",
      payingUsers: num(revenue?.payingUsers),
      arpuCents: num(revenue?.arpuCents),
      conversionRate: num(revenue?.conversionRate),
      planDistribution,
    },
    quota: {
      freeHistoryLimit: num(quota?.freeHistoryLimit),
      usersAtLimit: num(quota?.usersAtLimit),
    },
  };
}

export function parseTimeseries(raw: unknown): AdminTimeseries | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const days = asArray(record.days)
    .map((item) => {
      const point = asRecord(item);
      const date = asString(point?.date);

      if (!point || !date) {
        return null;
      }

      return {
        date,
        timestamp: asTimestamp(point.timestamp) ?? 0,
        signups: num(point.signups),
        sessions: num(point.sessions),
        listenTimeSec: num(point.listenTimeSec),
        activeUsers: num(point.activeUsers),
      };
    })
    .filter((point): point is TimeseriesPoint => point !== null);

  return {
    days,
    from: asTimestamp(record.from),
    to: asTimestamp(record.to),
  };
}

export function parseTopTracks(raw: unknown): AdminTopTracks | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const rows = asArray(record.rows)
    .map((item) => {
      const row = asRecord(item);

      if (!row) {
        return null;
      }

      return {
        trackId: asString(row.trackId),
        contentHash: asString(row.contentHash),
        title: asString(row.title) ?? "Unknown track",
        author: asString(row.author),
        isAudiobook: asBoolean(row.isAudiobook),
        origin: asString(row.origin) ?? "local",
        listenTimeSec: num(row.listenTimeSec),
        playCount: num(row.playCount),
        listenerCount: num(row.listenerCount),
      };
    })
    .filter((row): row is TopTrack => row !== null);

  return { days: num(record.days), rows };
}

export function parseRetention(raw: unknown): AdminRetention | null {
  const record = asRecord(raw);

  if (!record) {
    return null;
  }

  const cohorts = asArray(record.cohorts)
    .map((item) => {
      const cohort = asRecord(item);
      const cohortDate = asString(cohort?.cohortDate);

      if (!cohort || !cohortDate) {
        return null;
      }

      const weeks = asArray(cohort.weeks)
        .map((entry) => {
          const week = asRecord(entry);
          if (!week) return null;
          return {
            week: num(week.week),
            activeUsers: num(week.activeUsers),
            rate: num(week.rate),
          };
        })
        .filter((week): week is RetentionWeek => week !== null);

      return {
        cohortStart: asTimestamp(cohort.cohortStart) ?? 0,
        cohortDate,
        size: num(cohort.size),
        weeks,
      };
    })
    .filter((cohort): cohort is RetentionCohort => cohort !== null);

  return { cohorts, weeks: num(record.weeks) };
}
