import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { subscription } from "../../../../mod.ts";
import { pageArgs, textFilter } from "../../query.ts";

/**
 * The subscriptions table: who is paying, for what, until when.
 *
 * Sorted by `currentPeriodEnd` ascending — the renewals and expiries that need
 * attention are at the top, which is the order an operator actually wants when
 * they open this page. Rows without a period end (lifetime) sort last.
 */
export const adminListSubscriptionsFn: ActFn = async (body) => {
  const { set } = body.details;
  const { page, limit, skip } = pageArgs(set.page, set.limit);

  const conditions: Record<string, unknown>[] = [];
  if (set.status) conditions.push({ status: set.status });
  if (set.planCode) conditions.push({ planCode: set.planCode });

  const search = textFilter(set.search, ["user.email", "user.username"]);
  if (search) conditions.push(search);

  const match = conditions.length > 0 ? { $and: conditions } : {};

  const total = await subscription.countDocument({ filter: match });

  const rows = await subscription
    .aggregation({
      pipeline: [
        { $match: match },
        { $sort: { currentPeriodEnd: 1, createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            planCode: 1,
            status: 1,
            startedAt: 1,
            currentPeriodStart: 1,
            currentPeriodEnd: 1,
            cancelAtPeriodEnd: 1,
            canceledAt: 1,
            provider: 1,
            providerRef: 1,
            autoRenew: 1,
            note: 1,
            createdAt: 1,
            "user._id": 1,
            "user.email": 1,
            "user.username": 1,
            "user.displayName": 1,
          },
        },
      ],
    })
    .toArray();

  return {
    rows: rows.map((row) => pickByGet(row, body.details.get)),
    total,
    page,
    limit,
  };
};
