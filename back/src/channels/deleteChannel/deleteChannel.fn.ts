import { type ActFn, ObjectId } from "lesan";
import { channel, coreApp } from "../../../mod.ts";
import { type MyContext, throwError } from "@lib";
import { recordAudit } from "../../admin/audit.ts";
import { hardDeleteChannel } from "../cascade.ts";
import { actor, rowScope } from "../authz.ts";

/**
 * Hard-delete a channel, leaf-first — one act for creator and operator
 * (prompt D15, plan §3d).
 *
 * The creator path is unchanged: their scope pins the row to their own
 * `user._id`, and they need no confirmation to remove their own content. An
 * operator reaches any row, but a **cross-tenant** delete (not the caller's own)
 * is irreversible, so it demands `confirmName` and is audited — the same guard
 * `adminDeleteUser` uses. The cascade itself lives in `cascade.ts` so both paths
 * delete identically.
 */
export const deleteChannelFn: ActFn = async (body) => {
  const { set } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;
  const who = actor();
  const channelId = new ObjectId(set.channelId);

  const channelRow = await channel.findOne({
    filters: rowScope(who, channelId, { write: true }),
    projection: { _id: 1, name: 1, "user._id": 1 },
  });
  if (!channelRow) throwError("Channel not found");

  const isOwner = String(channelRow!.user?._id) === String(user._id);
  if (!isOwner && set.confirmName !== channelRow!.name) {
    throwError("Confirmation name does not match the channel");
  }

  await hardDeleteChannel(channelId);

  if (!isOwner) {
    await recordAudit({
      action: "channel.delete",
      targetType: "channel",
      targetId: String(channelId),
      summary: `Deleted channel ${channelRow!.name} permanently`,
      metadata: { name: channelRow!.name, actor: String(user._id) },
    });
  }

  return { success: true };
};
