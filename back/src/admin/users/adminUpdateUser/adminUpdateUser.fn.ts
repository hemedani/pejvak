import { type ActFn, ObjectId } from "lesan";
import { user } from "../../../../mod.ts";
import { currentUser, roleOf, statusOf, throwError } from "@lib";
import { recordAudit } from "../../audit.ts";
import { safeUserProjection } from "../../query.ts";

/**
 * Edits an account, including the two fields that decide what it may do.
 *
 * The guards are the interesting part, and they exist because this act is the
 * one place an operator can lock themselves out:
 *
 * - You cannot demote or suspend **yourself**.
 * - You cannot remove the **last admin** — the panel would become unmanageable
 *   with no way back in short of a database console.
 *
 * Every accepted change is audited with the previous value, so "who made this
 * person an admin?" has an answer.
 */
export const adminUpdateUserFn: ActFn = async (body) => {
  const { set, get } = body.details;
  const actor = currentUser();
  const userId = new ObjectId(set.userId);

  const target = await user.findOne({
    filters: { _id: userId },
    projection: {
      _id: 1,
      username: 1,
      email: 1,
      displayName: 1,
      avatarUrl: 1,
      role: 1,
      status: 1,
      suspendedAt: 1,
      suspendedReason: 1,
    },
  });

  if (!target) throwError("User not found");

  const isSelf = String(actor._id) === String(userId);
  const currentRole = roleOf(target);
  const currentStatus = statusOf(target);

  if (isSelf && set.role !== undefined && set.role !== currentRole) {
    throwError("You cannot change your own role");
  }
  if (isSelf && set.status !== undefined && set.status !== currentStatus) {
    throwError("You cannot change the status of your own account");
  }

  if (
    currentRole === "admin" &&
    set.role !== undefined &&
    set.role !== "admin"
  ) {
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

  if (set.email !== undefined && set.email !== target!.email) {
    const taken = await user.findOne({
      filters: { email: set.email, _id: { $ne: userId } },
      projection: { _id: 1 },
    });
    if (taken) throwError("Another account already uses that email");
  }

  const fields: Record<string, unknown> = { updatedAt: new Date() };
  const unset: Record<string, string> = {};
  const changes: Record<string, { from: unknown; to: unknown }> = {};

  for (
    const key of [
      "username",
      "email",
      "displayName",
      "avatarUrl",
      "role",
    ] as const
  ) {
    if (set[key] !== undefined) {
      fields[key] = set[key];
      changes[key] = { from: target![key] ?? null, to: set[key] };
    }
  }

  if (set.status !== undefined && set.status !== currentStatus) {
    fields.status = set.status;
    changes.status = { from: currentStatus, to: set.status };

    if (set.status === "suspended") {
      fields.suspendedAt = Date.now();
      fields.suspendedReason = set.suspendedReason ?? "Suspended by an admin";
    } else {
      unset.suspendedAt = "";
      unset.suspendedReason = "";
    }
  } else if (
    set.suspendedReason !== undefined &&
    currentStatus === "suspended"
  ) {
    fields.suspendedReason = set.suspendedReason;
    changes.suspendedReason = {
      from: target!.suspendedReason ?? null,
      to: set.suspendedReason,
    };
  }

  if (Object.keys(changes).length === 0) {
    return await user.findOne({
      filters: { _id: userId },
      projection: safeUserProjection(get),
    });
  }

  await user.findOneAndUpdate({
    filter: { _id: userId },
    update: {
      $set: fields,
      ...(Object.keys(unset).length > 0 ? { $unset: unset } : {}),
    } as never,
    projection: { _id: 1 },
  });

  await recordAudit({
    action: "user.update",
    targetType: "user",
    targetId: String(userId),
    summary: `Updated ${target!.email} (${Object.keys(changes).join(", ")})`,
    metadata: { changes },
  });

  return await user.findOne({
    filters: { _id: userId },
    projection: safeUserProjection(get),
  });
};
