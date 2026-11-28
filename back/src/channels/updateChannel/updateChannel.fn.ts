import { type ActFn, ObjectId } from "lesan";
import { channel, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import { recordAudit } from "../../admin/audit.ts";
import { actor, rowScope } from "../authz.ts";

/**
 * Patch a channel — one act for creator and operator (prompt D15).
 *
 * The tenant boundary is the *query scope*, not a separate act: a creator is
 * pinned to `"owner._id": theirId`, an operator (`admin`) reaches any row. The
 * business rule that makes sharing safe is the `status` gate — flipping
 * `active`/`removed` is a **takedown**, so only an operator may send it and only
 * an operator's change is audited. A creator who tries to set `status` is
 * refused, which is what stops an owner from undoing their own moderation.
 */
export const updateChannelFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const who = actor();

  const existing = await channel.findOne({
    filters: rowScope(who, new ObjectId(set.channelId), {
      write: true,
      ownerField: "owner",
    }),
    projection: { _id: 1, status: 1, name: 1 },
  });
  if (!existing) throwError("Channel not found");

  if (set.categories !== undefined && set.categories.length === 0) {
    throwError("A channel needs at least one category");
  }

  const wantsStatus = set.status !== undefined &&
    set.status !== existing!.status;
  if (wantsStatus && !who.isAdmin) {
    throwError("Only an operator can change a channel's status");
  }

  const editable = [
    "name",
    "bio",
    "categories",
    "languageCode",
    "avatarUrl",
    "gallery",
    "donationUrl",
    "websiteUrl",
    "socials",
    "contactEmail",
  ] as const;

  const fields: Record<string, unknown> = { updatedAt: new Date() };
  for (const key of editable) {
    const value = set[key];
    if (value !== undefined) fields[key] = value;
  }
  if (wantsStatus) fields.status = set.status;

  const changedContent = editable.some((key) => set[key] !== undefined);
  if (!changedContent && !wantsStatus) {
    return await channel.findOne({
      filters: { _id: existing!._id },
      projection: get,
    });
  }

  await channel.findOneAndUpdate({
    filter: { _id: existing!._id },
    update: { $set: fields } as never,
    projection: { _id: 1 },
  });

  // Only the moderation change is an operator action worth an audit line.
  if (wantsStatus) {
    await recordAudit({
      action: "channel.update",
      targetType: "channel",
      targetId: String(existing!._id),
      summary: `Set channel ${existing!.name} status ${
        existing!.status
      } → ${set.status}`,
      metadata: {
        from: existing!.status,
        to: set.status,
        ...(set.reason !== undefined ? { reason: set.reason } : {}),
        editor: String(user._id),
      },
    });
  }

  return await channel.findOne({
    filters: { _id: existing!._id },
    projection: get,
  });
};
