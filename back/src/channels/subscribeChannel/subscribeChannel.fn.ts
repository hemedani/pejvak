import { type ActFn, ObjectId } from "lesan";
import { channel, channelSubscription, coreApp } from "../../../mod.ts";
import { type MyContext, pickByGet, throwError } from "@lib";

/** Mongo's duplicate-key error, the one a racing subscribe can produce. */
const isDuplicateKey = (error: unknown): boolean => {
  if (typeof error === "object" && error !== null) {
    if ((error as { code?: unknown }).code === 11000) return true;
  }
  return error instanceof Error && error.message.includes("E11000");
};

/**
 * Subscribe the caller to a channel.
 *
 * Idempotent in two layers: the pre-check returns the existing state without a
 * write, and the unique `{ channel, user }` index makes a lost race a duplicate
 * key that is treated as success rather than an error the device would retry
 * forever. A creator cannot follow their own channel, because the owner is not
 * a subscriber of it. Only `active` channels are subscribable — a removed
 * channel is not discoverable, so it cannot be followed through a stale link.
 *
 * `subscriberCount` is informational and moved with `$inc`, the same way
 * `audioCount`/`playlistCount` are.
 */
export const subscribeChannelFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);
  const channelId = new ObjectId(set.channelId);

  const channelRow = await channel.findOne({
    filters: { _id: channelId, status: "active" },
    projection: { _id: 1, "owner._id": 1, subscriberCount: 1 },
  });
  if (!channelRow) throwError("Channel not found");

  if (String(channelRow!.owner?._id) === String(userId)) {
    throwError("You cannot subscribe to your own channel");
  }

  const existing = await channelSubscription.findOne({
    filters: { "channel._id": channelId, "user._id": userId },
    projection: { _id: 1 },
  });
  if (existing) {
    return pickByGet(
      { subscribed: true, subscriberCount: channelRow!.subscriberCount ?? 0 },
      get,
    );
  }

  const now = new Date();
  try {
    const created = await channelSubscription.insertOne({
      doc: { createdAt: now, updatedAt: now },
      relations: {
        channel: { _ids: channelId, relatedRelations: {} },
        user: { _ids: userId, relatedRelations: {} },
      } as never,
      projection: { _id: 1 },
    });
    if (!created) throwError("Subscription was not created");
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    return pickByGet(
      { subscribed: true, subscriberCount: channelRow!.subscriberCount ?? 0 },
      get,
    );
  }

  await channel.findOneAndUpdate({
    filter: { _id: channelId },
    update: { $inc: { subscriberCount: 1 } } as never,
    projection: { _id: 1 },
  });

  return pickByGet(
    {
      subscribed: true,
      subscriberCount: (channelRow!.subscriberCount ?? 0) + 1,
    },
    get,
  );
};
