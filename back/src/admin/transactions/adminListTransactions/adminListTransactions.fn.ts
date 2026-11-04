import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { billingTransaction } from "../../../../mod.ts";
import { pageArgs, rangeFilter, textFilter } from "../../query.ts";

/**
 * The payment ledger.
 *
 * Newest first, because the row an operator is usually looking for is the one
 * that just failed. `pending` rows are the work queue: with the manual provider
 * every card-to-card payment sits here until someone confirms it, so the panel
 * filters on this status rather than on a date.
 */
export const adminListTransactionsFn: ActFn = async (body) => {
  const { set } = body.details;
  const { page, limit, skip } = pageArgs(set.page, set.limit);

  const conditions: Record<string, unknown>[] = [];

  if (set.status) conditions.push({ status: set.status });
  if (set.provider) conditions.push({ provider: set.provider });
  if (set.planCode) conditions.push({ planCode: set.planCode });
  if (set.userId) conditions.push({ userId: set.userId });

  const search = textFilter(set.search, ["userEmail", "reference"]);
  if (search) conditions.push(search);

  const range = rangeFilter("createdAt", set.from, set.to);
  if (range) {
    // `createdAt` is a Date, unlike every other timestamp in this project, so
    // the numeric bounds have to be converted before they reach Mongo.
    const bounds = range.createdAt as { $gte?: number; $lte?: number };
    conditions.push({
      createdAt: {
        ...(bounds.$gte !== undefined ? { $gte: new Date(bounds.$gte) } : {}),
        ...(bounds.$lte !== undefined ? { $lte: new Date(bounds.$lte) } : {}),
      },
    });
  }

  const match = conditions.length > 0 ? { $and: conditions } : {};

  const total = await billingTransaction.countDocument({ filter: match });

  const rows = await billingTransaction
    .aggregation({
      pipeline: [
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
            _id: 1,
            reference: 1,
            userId: 1,
            userEmail: 1,
            planCode: 1,
            planTitle: 1,
            amountCents: 1,
            currency: 1,
            billingInterval: 1,
            status: 1,
            provider: 1,
            providerRef: 1,
            periodStart: 1,
            periodEnd: 1,
            note: 1,
            paidAt: 1,
            refundedAt: 1,
            createdAt: 1,
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
