import { type ActFn } from "lesan";
import { pickByGet } from "@lib";
import { adminAuditLog } from "../../../../mod.ts";
import { pageArgs } from "../../query.ts";

/**
 * The activity feed, newest first.
 *
 * Filters are exact matches rather than a search box: `action` is a closed
 * vocabulary (`user.update`, `subscription.grant`, …), and `targetId` is how the
 * panel answers "what has been done to this account?" from its detail page.
 *
 * `metadata` stays a JSON string here and is parsed by the client. Turning it
 * into an object in the act would mean the shape of every action had to be
 * declared in the projection, and an old row with a retired action would then
 * fail the read.
 */
export const adminListAuditLogsFn: ActFn = async (body) => {
  const { set } = body.details;
  const { page, limit, skip } = pageArgs(set.page, set.limit);

  const conditions: Record<string, unknown>[] = [];

  if (set.actorId) conditions.push({ actorId: set.actorId });
  if (set.action) conditions.push({ action: set.action });
  if (set.targetType) conditions.push({ targetType: set.targetType });
  if (set.targetId) conditions.push({ targetId: set.targetId });

  if (set.from !== undefined || set.to !== undefined) {
    conditions.push({
      createdAt: {
        ...(set.from !== undefined ? { $gte: new Date(set.from) } : {}),
        ...(set.to !== undefined ? { $lte: new Date(set.to) } : {}),
      },
    });
  }

  const match = conditions.length > 0 ? { $and: conditions } : {};

  const total = await adminAuditLog.countDocument({ filter: match });

  const rows = await adminAuditLog
    .aggregation({
      pipeline: [
        { $match: match },
        { $sort: { createdAt: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $project: {
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
