import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import {
  annotation,
  onlineCollection,
  plan,
  playbackContext,
  playbackSession,
  playlist,
  subscription,
  track,
  user,
} from "../../../../mod.ts";
import { FREE_PLAN_CODE } from "../../../entitlements/codes.ts";
import { canonicalLimits } from "../../../entitlements/entitlement.ts";
import { DAY_MS } from "../../time.ts";

type CountRow = { _id: unknown; count: number };

const sumCounts = (rows: CountRow[], match: (id: unknown) => boolean) =>
  rows.filter((row) => match(row._id)).reduce(
    (total, row) => total + row.count,
    0,
  );

/**
 * The panel's landing numbers.
 *
 * Two rules shape it:
 *
 * - **Derived, never stored.** There is no counters collection. Every figure is
 *   an aggregation over the rows that define it, so it cannot disagree with the
 *   history it summarises. That is the same rule the track play counts follow.
 * - **`active` means "listened", not "logged in".** A login is not engagement
 *   in an offline-first player, and the app can run for weeks without one. The
 *   session collection is the honest signal.
 *
 * MRR is computed from the plans table, not from the price snapshot on the
 * transactions: it answers "what does the current book of business bill per
 * month?", which is a forward-looking number. Lifetime plans contribute 0,
 * because they have no monthly revenue by definition.
 */
export const adminGetOverviewFn: ActFn = async (body) => {
  const now = Date.now();

  const [
    usersByStatus,
    newLast24h,
    newLast7d,
    newLast30d,
    activeLast24h,
    activeLast7d,
    activeLast30d,
    sessionTotals,
    trackTotals,
    annotationCount,
    playlistCount,
    contextCount,
    onlineCollectionCount,
    activeSubscriptions,
    plans,
  ] = await Promise.all([
    user
      .aggregation({
        pipeline: [
          {
            $group: {
              _id: { $ifNull: ["$status", "active"] },
              count: { $sum: 1 },
            },
          },
        ],
      })
      .toArray() as Promise<CountRow[]>,
    user.countDocument({
      filter: { createdAt: { $gte: new Date(now - DAY_MS) } },
    }),
    user.countDocument({
      filter: { createdAt: { $gte: new Date(now - 7 * DAY_MS) } },
    }),
    user.countDocument({
      filter: { createdAt: { $gte: new Date(now - 30 * DAY_MS) } },
    }),
    playbackSession
      .aggregation({
        pipeline: [
          { $match: { startedAt: { $gte: now - DAY_MS } } },
          { $group: { _id: "$user._id" } },
          { $count: "count" },
        ],
      })
      .toArray(),
    playbackSession
      .aggregation({
        pipeline: [
          { $match: { startedAt: { $gte: now - 7 * DAY_MS } } },
          { $group: { _id: "$user._id" } },
          { $count: "count" },
        ],
      })
      .toArray(),
    playbackSession
      .aggregation({
        pipeline: [
          { $match: { startedAt: { $gte: now - 30 * DAY_MS } } },
          { $group: { _id: "$user._id" } },
          { $count: "count" },
        ],
      })
      .toArray(),
    playbackSession
      .aggregation({
        pipeline: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              listenTimeSec: { $sum: "$durationListenedSec" },
              lastStartedAt: { $max: "$startedAt" },
            },
          },
        ],
      })
      .toArray(),
    track
      .aggregation({
        pipeline: [
          {
            $group: {
              _id: null,
              count: { $sum: 1 },
              storageBytes: { $sum: "$fileSizeBytes" },
            },
          },
        ],
      })
      .toArray(),
    annotation.countDocument({}),
    playlist.countDocument({}),
    playbackContext.countDocument({}),
    onlineCollection.countDocument({}),
    subscription
      .aggregation({
        pipeline: [
          {
            $match: {
              status: { $in: ["active", "trialing"] },
              $or: [
                { currentPeriodEnd: { $exists: false } },
                { currentPeriodEnd: { $gt: now } },
              ],
            },
          },
          { $group: { _id: "$planCode", count: { $sum: 1 } } },
        ],
      })
      .toArray() as Promise<CountRow[]>,
    plan
      .aggregation({
        pipeline: [
          {
            $project: {
              code: 1,
              title: 1,
              priceCents: 1,
              currency: 1,
              billingInterval: 1,
              limits: 1,
              isActive: 1,
            },
          },
        ],
      })
      .toArray(),
  ]);

  const totalUsers = usersByStatus.reduce((total, row) => total + row.count, 0);
  const planByCode = new Map(plans.map((row) => [String(row.code), row]));

  const payingUsers = activeSubscriptions.reduce(
    (total, row) => total + row.count,
    0,
  );

  const mrrCents = activeSubscriptions.reduce((total, row) => {
    const found = planByCode.get(String(row._id));
    if (!found) return total;

    const price = Number(found.priceCents ?? 0);
    const interval = String(found.billingInterval ?? "month");

    if (interval === "year") return total + Math.round(price / 12);
    if (interval === "lifetime") return total;
    return total + price;
  }, 0);

  const freePlan = planByCode.get(FREE_PLAN_CODE);
  const freeHistoryLimit = canonicalLimits(freePlan?.limits).historyEntries;

  // How many listeners the paywall is currently pressing against. One grouped
  // count over an indexed field; it is the only figure here that scans every
  // session row, and it is what turns "we have 500-history cap" into a number.
  const atLimit = freeHistoryLimit >= 0
    ? await playbackSession
      .aggregation({
        pipeline: [
          { $group: { _id: "$user._id", count: { $sum: 1 } } },
          { $match: { count: { $gte: freeHistoryLimit } } },
          { $count: "users" },
        ],
      })
      .toArray()
    : [];

  const sessions = sessionTotals[0] ?? {};
  const tracks = trackTotals[0] ?? {};

  return pickByGet({
    generatedAt: now,
    users: {
      total: totalUsers,
      active: sumCounts(usersByStatus, (id) => id === "active"),
      suspended: sumCounts(usersByStatus, (id) => id === "suspended"),
      newLast24h,
      newLast7d,
      newLast30d,
    },
    activity: {
      activeLast24h: activeLast24h[0]?.count ?? 0,
      activeLast7d: activeLast7d[0]?.count ?? 0,
      activeLast30d: activeLast30d[0]?.count ?? 0,
    },
    content: {
      sessions: sessions.count ?? 0,
      listenTimeSec: sessions.listenTimeSec ?? 0,
      lastSessionAt: sessions.lastStartedAt ?? null,
      tracks: tracks.count ?? 0,
      storageBytes: tracks.storageBytes ?? 0,
      annotations: annotationCount,
      playlists: playlistCount,
      contexts: contextCount,
      onlineCollections: onlineCollectionCount,
    },
    revenue: {
      mrrCents,
      currency: plans.find((row) =>
        Number(row.priceCents ?? 0) > 0
      )?.currency ??
        "USD",
      payingUsers,
      arpuCents: payingUsers > 0 ? Math.round(mrrCents / payingUsers) : 0,
      conversionRate: totalUsers > 0
        ? Number((payingUsers / totalUsers).toFixed(4))
        : 0,
      planDistribution: plans
        .map((row) => ({
          planCode: String(row.code),
          title: row.title,
          priceCents: row.priceCents ?? 0,
          isActive: row.isActive ?? true,
          users: activeSubscriptions.find((sub) =>
            String(sub._id) === String(row.code)
          )?.count ?? 0,
        }))
        .sort((a, b) => b.users - a.users),
    },
    quota: {
      freeHistoryLimit,
      usersAtLimit: atLimit[0]?.users ?? 0,
    },
  }, body.details.get);
};
