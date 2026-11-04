import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { plan, subscription } from "../../../../mod.ts";

/**
 * The plan catalogue, with how many listeners each one currently holds.
 *
 * The subscriber count is a live `$group` rather than a column on the plan: a
 * count that is written on purchase has to be decremented on expiry, refund and
 * deletion too, and the first missed one makes the pricing page lie.
 */
export const adminListPlansFn: ActFn = async (body) => {
  const { includeInactive } = body.details.set;

  const [plans, counts] = await Promise.all([
    plan
      .aggregation({
        pipeline: [
          ...(includeInactive ? [] : [{ $match: { isActive: true } }]),
          { $sort: { sortOrder: 1, priceCents: 1 } },
        ],
      })
      .toArray(),
    subscription
      .aggregation({
        pipeline: [
          {
            $match: {
              status: { $in: ["active", "trialing"] },
              $or: [
                { currentPeriodEnd: { $exists: false } },
                { currentPeriodEnd: { $gt: Date.now() } },
              ],
            },
          },
          { $group: { _id: "$planCode", count: { $sum: 1 } } },
        ],
      })
      .toArray(),
  ]);

  const countByCode = new Map(
    counts.map((row) => [String(row._id), Number(row.count ?? 0)]),
  );

  const rows = plans.map((row) => ({
    ...pickByGet({
      ...row,
      isActive: row.isActive ?? true,
    }, body.details.get),
    subscribers: countByCode.get(String(row.code)) ?? 0,
  }));

  return { rows, total: rows.length, page: 1, limit: rows.length };
};
