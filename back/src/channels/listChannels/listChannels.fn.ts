import { type ActFn, type Document } from "lesan";
import { channel } from "../../../mod.ts";
import { projectionOrPure } from "@lib";
import { actorOrNull, statusScope } from "../authz.ts";
import { pageArgs, textFilter } from "../browse.ts";

/**
 * The channel directory (prompt D15: one act, role-aware).
 *
 * A creator/listener and an anonymous caller only ever get `status: "active"`;
 * an operator may list all or filter to `removed`. The wrapper is
 * `{ rows, total, page, limit }` because a discovery grid needs a total.
 */
export const listChannelsFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const who = actorOrNull();
  const { page, limit, skip } = pageArgs(set.page, set.limit);

  const conditions: Document[] = [statusScope(who, set.status)];

  if (set.category) conditions.push({ categories: set.category });

  const search = textFilter(set.q, ["name", "bio"]);
  if (search) conditions.push(search);

  const match = conditions.length === 1 ? conditions[0] : { $and: conditions };

  const sortSpec = set.sort === "popular"
    ? { audioCount: -1, createdAt: -1 }
    : { createdAt: -1 };

  const total = await channel.countDocument({ filter: match });

  const rows = await channel.aggregation({
    pipeline: [
      { $match: match },
      { $sort: sortSpec },
      { $skip: skip },
      { $limit: limit },
    ],
    projection: projectionOrPure(get, "channel"),
  }).toArray();

  return { rows, total, page, limit };
};
