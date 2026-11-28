import { type ActFn, ObjectId } from "lesan";
import { channel, coreApp, user } from "../../../../mod.ts";
import { currentUser, pickByGet, roleOf, throwError } from "@lib";
import { hardDeleteChannel } from "../../../channels/cascade.ts";
import { recordAudit } from "../../audit.ts";

/**
 * Deletes an account and everything that belongs to it.
 *
 * The purge is a set of `deleteMany` calls on the raw collections rather than
 * `deleteOne({ hardCascade: true })`. Lesan's cascade walks relations one
 * document at a time and rewrites the parent's reverse arrays as it goes — for
 * an account with thousands of sessions that is thousands of round trips, and
 * the reverse array is exactly what the history cap exists to keep small. A
 * direct delete by `user._id` is one query per collection and leaves nothing
 * behind, because every child model embeds its owner.
 *
 * **Payments are not deleted.** `billingTransaction` stores the owner as a
 * string, not a relation, precisely so a receipt survives the account — it is
 * a financial record, and the tax and reconciliation trail outlives the login.
 *
 * Children go first, the account last: if a delete fails halfway, the operator
 * sees a real error and the account is still there to retry, rather than a
 * user document with orphaned data behind it.
 */
export const adminDeleteUserFn: ActFn = async (body) => {
  const { set } = body.details;
  const actor = currentUser();
  const userId = new ObjectId(set.userId);

  const target = await user.findOne({
    filters: { _id: userId },
    projection: { _id: 1, email: 1, username: 1, role: 1 },
  });

  if (!target) throwError("User not found");

  if (String(actor._id) === String(userId)) {
    throwError("You cannot delete your own account");
  }

  if (roleOf(target) === "admin") {
    const otherAdmins = await user.countDocument({
      filter: {
        _id: { $ne: userId },
        role: "admin",
        status: { $ne: "suspended" },
      },
    });
    if (otherAdmins === 0) {
      throwError("There must be at least one active admin");
    }
  }

  if (
    set.confirmEmail.trim().toLowerCase() !==
      String(target!.email ?? "").trim().toLowerCase()
  ) {
    throwError("Type the account's email address to confirm the deletion");
  }

  // A listener may own channels, whose folders, episodes and hosted bytes hang
  // off `channel.owner` rather than `user._id`, so the per-collection loop below
  // would miss them. `hardDeleteChannel` is the same leaf-first purge
  // `deleteChannel` uses, including the bytes on disk.
  const ownedChannels = await channel.aggregation({
    pipeline: [
      { $match: { "owner._id": userId } },
      { $project: { _id: 1 } },
    ],
  }).toArray();

  for (const owned of ownedChannels) {
    await hardDeleteChannel(owned._id as ObjectId);
  }

  const collections = [
    "annotation",
    "playbackSession",
    "playbackContext",
    "playlist",
    "onlineCollection",
    "aiUsage",
    "subscription",
    "channelSubscription",
    "track",
  ];

  const purged: Record<string, number> = { channel: ownedChannels.length };

  for (const collection of collections) {
    const result = await coreApp.odm
      .getCollection(collection)
      .deleteMany({ "user._id": userId });
    purged[collection] = result.deletedCount ?? 0;
  }

  const removed = await coreApp.odm
    .getCollection("user")
    .deleteOne({ _id: userId });

  if ((removed.deletedCount ?? 0) === 0) {
    throwError("The account could not be deleted");
  }

  await recordAudit({
    action: "user.delete",
    targetType: "user",
    targetId: String(userId),
    summary: `Deleted ${target!.email} and all of their data`,
    metadata: { email: target!.email, username: target!.username, purged },
  });

  return pickByGet(
    { deleted: true, userId: String(userId), purged },
    body.details.get,
  );
};
