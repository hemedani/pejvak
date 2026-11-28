import { type ActFn, type Document, ObjectId } from "lesan";
import { channel, channelSubscription, coreApp, user } from "../../../mod.ts";
import { type MyContext, pickByGet, throwError } from "@lib";
import { actor } from "../authz.ts";
import { pageArgs } from "../browse.ts";

/** The only user fields a subscriber list may expose. */
const SUBSCRIBER_USER_FIELDS = [
  "_id",
  "username",
  "displayName",
  "avatarUrl",
] as const;

/**
 * The projection for the subscriber read.
 *
 * An inclusion projection built from an arbitrary `get` would let an owner ask
 * for `email` or `setting` (the model's `excludes` only applies to relations,
 * not to a direct read), so the request is filtered through the allow-list
 * first. An absent/empty `get` means all four fields.
 */
const subscriberProjection = (
  get?: Document,
): Record<string, 1> => {
  const requested = Object.keys(get ?? {}).filter((key) =>
    (SUBSCRIBER_USER_FIELDS as readonly string[]).includes(key)
  );
  const keys = requested.length > 0 ? requested : [...SUBSCRIBER_USER_FIELDS];
  const projection: Record<string, 1> = {};
  for (const key of keys) projection[key] = 1;
  projection._id = 1;
  return projection;
};

/**
 * List a channel's subscribers.
 *
 * Visible to the owner and to an operator (support may read); everyone else
 * gets "Channel not found" rather than a 403, so a channel id cannot be probed
 * for existence through this act.
 *
 * The same two-pass shape as `getMySubscribedChannels`: the subscription rows
 * are the ordered id list, then the users are fetched in that order. The
 * `{ rows, total, page, limit }` wrapper is the panel/list convention; a
 * listener-facing list would be a bare array, but this one is an owner tool.
 */
export const listChannelSubscribersFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user: caller }: MyContext = coreApp.contextFns
    .getContextModel() as MyContext;
  const who = actor();
  const { page, limit, skip } = pageArgs(set.page, set.limit);
  const channelId = new ObjectId(set.channelId);

  const channelRow = await channel.findOne({
    filters: { _id: channelId },
    projection: { _id: 1, "owner._id": 1 },
  });
  if (!channelRow) throwError("Channel not found");

  const isOwner = String(channelRow!.owner?._id) === String(caller._id);
  if (!isOwner && !who.canReadAll) throwError("Channel not found");

  const total = await channelSubscription.countDocument({
    filter: { "channel._id": channelId },
  });

  const subscriptions = await channelSubscription.aggregation({
    pipeline: [
      { $match: { "channel._id": channelId } },
      { $sort: { createdAt: -1 } },
      { $skip: skip },
      { $limit: limit },
      { $project: { "user._id": 1 } },
    ],
  }).toArray();

  const ids = subscriptions
    .map((row) => row.user?._id as ObjectId | undefined)
    .filter((id): id is ObjectId => id !== undefined);

  if (ids.length === 0) return { rows: [], total, page, limit };

  const users = await user.aggregation({
    pipeline: [{ $match: { _id: { $in: ids } } }],
    projection: subscriberProjection(get as Document | undefined),
  }).toArray();

  const byId = new Map(users.map((row) => [String(row._id), row]));
  const rows = ids
    .map((id) => byId.get(String(id)))
    .filter((row): row is NonNullable<typeof row> => row !== undefined)
    .map((row) => pickByGet(row, get as Document | undefined));

  return { rows, total, page, limit };
};
