import { type ActFn, ObjectId } from "lesan";
import { channel, channelSubscription, coreApp } from "../../../mod.ts";
import { type MyContext, pickByGet } from "@lib";

/**
 * Unsubscribe the caller from a channel.
 *
 * Idempotent: no row is a success, not an error, so a device retrying after a
 * dropped response converges. The counter is decremented only when a row was
 * actually removed, and the reply is clamped at zero so a pre-existing drift
 * cannot show a negative subscriber count.
 */
export const unsubscribeChannelFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const userId = new ObjectId(user._id);
  const channelId = new ObjectId(set.channelId);

  const existing = await channelSubscription.findOne({
    filters: { "channel._id": channelId, "user._id": userId },
    projection: { _id: 1 },
  });

  if (!existing) {
    const channelRow = await channel.findOne({
      filters: { _id: channelId },
      projection: { subscriberCount: 1 },
    });
    return pickByGet(
      {
        subscribed: false,
        subscriberCount: channelRow?.subscriberCount ?? 0,
      },
      get,
    );
  }

  await channelSubscription.deleteOne({ filter: { _id: existing._id } });
  await channel.findOneAndUpdate({
    filter: { _id: channelId },
    update: { $inc: { subscriberCount: -1 } } as never,
    projection: { _id: 1 },
  });

  const channelRow = await channel.findOne({
    filters: { _id: channelId },
    projection: { subscriberCount: 1 },
  });

  return pickByGet(
    {
      subscribed: false,
      subscriberCount: Math.max(0, channelRow?.subscriberCount ?? 0),
    },
    get,
  );
};
