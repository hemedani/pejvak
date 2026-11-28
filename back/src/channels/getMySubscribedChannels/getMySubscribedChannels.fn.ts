import { type ActFn, type Document, ObjectId } from "lesan";
import { channel, channelSubscription, coreApp } from "../../../mod.ts";
import { type MyContext, projectionOrPure } from "@lib";

/**
 * The caller's followed channels, newest follow first.
 *
 * Two passes rather than a `$lookup`: the subscription rows are the ordered,
 * paginated id list (the join collection's `{ user, createdAt }` index makes
 * this cheap), then the channels are fetched in that order with the caller's
 * own projection. A `$lookup` would have to sort the joined channels, which is
 * not what "my subscriptions, newest first" means.
 *
 * A channel that was later removed is skipped: the follow row can outlive the
 * channel for a moment, and a removed channel must not appear in a listener's
 * shelf.
 */
export const getMySubscribedChannelsFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);
  const limit = set.limit ?? 50;
  const skip = set.skip ?? limit * ((set.page ?? 1) - 1);

  const subscriptions = await channelSubscription.aggregation({
    pipeline: [
      { $match: { "user._id": userId } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { "channel._id": 1 } },
    ],
  }).toArray();

  const ids = subscriptions
    .map((row) => row.channel?._id as ObjectId | undefined)
    .filter((id): id is ObjectId => id !== undefined);

  if (ids.length === 0) return [];

  const rows = await channel.aggregation({
    pipeline: [{ $match: { _id: { $in: ids }, status: "active" } }],
    projection: projectionOrPure(get as Document | undefined, "channel"),
  }).toArray();

  const byId = new Map(rows.map((row) => [String(row._id), row]));
  return ids
    .map((id) => byId.get(String(id)))
    .filter((row): row is NonNullable<typeof row> => row !== undefined);
};
