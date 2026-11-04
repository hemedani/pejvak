import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { playbackSession, subscription, user } from "../../../../mod.ts";
import { FREE_PLAN_CODE } from "../../../entitlements/codes.ts";
import { pageArgs, safeUserProjection, textFilter } from "../../query.ts";

/**
 * The panel's account table.
 *
 * Two decisions are worth knowing about:
 *
 * - **Accounts predate `role`/`status`.** Filtering `role: "user"` must include
 *   documents that have no `role` field at all, otherwise the panel would show
 *   an empty list on a database that existed before this feature. The same goes
 *   for `status: "active"`.
 * - **`planCode` is resolved through the subscription collection.** There is no
 *   `planCode` on `User` on purpose (one source of truth), so the filter is a
 *   pre-query that turns a plan into a set of ids. It costs one extra query per
 *   page and cannot drift.
 */
export const adminListUsersFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { page, limit, skip } = pageArgs(set.page, set.limit);

  const conditions: Record<string, unknown>[] = [];

  if (set.role) {
    conditions.push(
      set.role === "user"
        ? { $or: [{ role: "user" }, { role: { $exists: false } }] }
        : { role: set.role },
    );
  }

  if (set.status) {
    conditions.push(
      set.status === "active"
        ? { $or: [{ status: "active" }, { status: { $exists: false } }] }
        : { status: set.status },
    );
  }

  const search = textFilter(set.search, ["username", "email", "displayName"]);
  if (search) conditions.push(search);

  if (set.planCode) {
    const now = Date.now();
    const subscribed = await subscription
      .aggregation({
        pipeline: [
          {
            $match: {
              status: { $in: ["active", "trialing"] },
              $or: [
                { currentPeriodEnd: { $exists: false } },
                { currentPeriodEnd: { $gt: now } },
              ],
              ...(set.planCode !== FREE_PLAN_CODE
                ? { planCode: set.planCode }
                : {}),
            },
          },
          { $group: { _id: "$user._id" } },
        ],
      })
      .toArray();

    const ids = subscribed.map((row) => row._id);
    conditions.push(
      set.planCode === FREE_PLAN_CODE
        ? { _id: { $nin: ids } }
        : { _id: { $in: ids } },
    );
  }

  const match = conditions.length > 0 ? { $and: conditions } : {};
  const sortField = set.sortBy ?? "createdAt";
  const sortDirection = set.sortOrder === "asc" ? 1 : -1;

  const total = await user.countDocument({ filter: match });

  const rows = await user
    .aggregation({
      pipeline: [
        { $match: match },
        { $sort: { [sortField]: sortDirection } },
        { $skip: skip },
        { $limit: limit },
        { $project: safeUserProjection(get) },
      ],
    })
    .toArray();

  const ids = rows.map((row) => row._id).filter(Boolean);

  const [subscriptions, stats] = await Promise.all([
    ids.length > 0
      ? subscription
        .aggregation({
          pipeline: [
            { $match: { "user._id": { $in: ids } } },
            { $sort: { createdAt: -1 } },
            {
              $project: {
                userId: "$user._id",
                planCode: 1,
                status: 1,
                currentPeriodEnd: 1,
                cancelAtPeriodEnd: 1,
              },
            },
          ],
        })
        .toArray()
      : Promise.resolve([]),
    ids.length > 0
      ? playbackSession
        .aggregation({
          pipeline: [
            { $match: { "user._id": { $in: ids } } },
            {
              $group: {
                _id: "$user._id",
                sessionCount: { $sum: 1 },
                listenTimeSec: { $sum: "$durationListenedSec" },
                lastActiveAt: { $max: "$startedAt" },
              },
            },
          ],
        })
        .toArray()
      : Promise.resolve([]),
  ]);

  const subscriptionByUser = new Map<string, Record<string, unknown>>();
  for (const row of subscriptions) {
    const key = String(row.userId);
    if (!subscriptionByUser.has(key)) subscriptionByUser.set(key, row);
  }

  const statsByUser = new Map<string, Record<string, unknown>>();
  for (const row of stats) statsByUser.set(String(row._id), row);

  return {
    rows: rows.map((row) => {
      const key = String(row._id);
      const activeSubscription = subscriptionByUser.get(key) ?? null;
      const usage = statsByUser.get(key);

      return {
        ...pickByGet({
          ...row,
          role: row.role ?? "user",
          status: row.status ?? "active",
        }, body.details.get),
        planCode: (activeSubscription?.planCode as string) ?? FREE_PLAN_CODE,
        subscription: activeSubscription,
        usage: {
          sessionCount: (usage?.sessionCount as number) ?? 0,
          listenTimeSec: (usage?.listenTimeSec as number) ?? 0,
          lastActiveAt: (usage?.lastActiveAt as number) ?? null,
        },
      };
    }),
    total,
    page,
    limit,
  };
};
