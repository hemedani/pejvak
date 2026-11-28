import { type ActFn, ObjectId } from "lesan";
import { channel, coreApp, user } from "../../../../mod.ts";
import { statusOf, throwError } from "@lib";
import { recordAudit } from "../../audit.ts";

type ChannelOwnerSnapshot = {
  _id: ObjectId;
  name: string;
  slug: string;
  owner?: { _id?: ObjectId; username?: string };
};

/**
 * Reassigns a channel to another account.
 *
 * Two cases motivate this: channels created before the `owner` relation existed
 * (so they have none), and channels registered by the wrong party that belong to
 * someone else (a brand, a co-host, an account being retired). Only an operator
 * can move a channel, because the creator of record cannot prove they are not
 * the one who should lose it.
 *
 * The embedded `owner` snapshot is replaced with Lesan's `addRelation` and
 * `replace: true`, which re-reads the target account and embeds its pure fields
 * (password excluded). `relatedRelations: { ownedChannels: true }` also moves the
 * channel snapshot between the two accounts' reverse arrays.
 *
 * Lesan's removal path reads the previous owner's array directly and throws when
 * the field is absent, which is the normal case for channels created while
 * `createChannel` passed `relatedRelations: {}`. So a missing (or non-array)
 * `ownedChannels` is initialized to `[]` first; the filter never matches an
 * existing array, so real entries are never clobbered.
 *
 * Folders, episodes and subscribers hang off the channel, not the account, so
 * they stay exactly where they are.
 *
 * Transferring to the current owner is a no-op (returns the row, writes no
 * audit), and a deleted account is refused because it can never sign in to
 * manage what it was given.
 */
export const adminTransferChannelOwnerFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const channelId = new ObjectId(set.channelId);
  const ownerId = new ObjectId(set.ownerId);

  const existingRow = await channel.findOne({
    filters: { _id: channelId },
    projection: {
      _id: 1,
      name: 1,
      slug: 1,
      "owner._id": 1,
      "owner.username": 1,
    },
  }) as ChannelOwnerSnapshot | null;

  if (!existingRow) {
    throwError("Channel not found");
  }

  const targetRow = await user.findOne({
    filters: { _id: ownerId },
    projection: { _id: 1, username: 1, status: 1 },
  });

  if (!targetRow) {
    throwError("The new owner account was not found");
  }

  if (statusOf(targetRow) === "deleted") {
    throwError("A channel cannot be assigned to a deleted account");
  }

  const existing = existingRow!;
  const target = targetRow!;

  const previousOwner = existing.owner;
  const alreadyOwner = previousOwner?._id !== undefined &&
    String(previousOwner._id) === String(ownerId);

  if (alreadyOwner) {
    return await channel.findOne({
      filters: { _id: channelId },
      projection: get,
    });
  }

  // Lesan's replace path reads the previous owner's reverse array directly and
  // crashes when the field is absent. Initialize only a missing/non-array value,
  // so an existing array (and its snapshots) is never overwritten.
  if (previousOwner?._id) {
    await coreApp.odm.getCollection("user").updateOne(
      {
        _id: previousOwner._id,
        ownedChannels: { $not: { $type: "array" } },
      },
      { $set: { ownedChannels: [] } },
    );
  }

  const updated = await channel.addRelation({
    filters: { _id: channelId },
    relations: {
      owner: {
        _ids: ownerId,
        relatedRelations: { ownedChannels: true },
      },
    } as never,
    projection: get,
    replace: true,
  });

  if (!updated) {
    throwError("Channel owner was not changed");
  }

  await recordAudit({
    action: "channel.transferOwner",
    targetType: "channel",
    targetId: String(channelId),
    summary: `Transferred "${existing.name}" to ${target.username}`,
    metadata: {
      channelId: String(channelId),
      channelName: existing.name,
      slug: existing.slug,
      fromOwnerId: previousOwner?._id ? String(previousOwner._id) : null,
      fromOwnerUsername: previousOwner?.username ?? null,
      toOwnerId: String(ownerId),
      toOwnerUsername: target.username,
    },
  });

  return updated;
};
