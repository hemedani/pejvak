import { type ActFn, ObjectId } from "lesan";
import { hash } from "@da/bcrypt";
import { user } from "../../../../mod.ts";
import { pickByGet, throwError } from "@lib";
import { recordAudit } from "../../audit.ts";

/**
 * Sets a new password for an account, for the "I am locked out" ticket.
 *
 * The generated password is returned **once**, in the response, and never
 * written to the audit log: the log is readable by every admin, and a password
 * in it would make the reset a way to take over an account rather than a way to
 * return one.
 */
export const adminResetUserPasswordFn: ActFn = async (body) => {
  const { set } = body.details;
  const userId = new ObjectId(set.userId);

  const target = await user.findOne({
    filters: { _id: userId },
    projection: { _id: 1, email: 1 },
  });

  if (!target) throwError("User not found");

  const generated = set.password === undefined;
  const password = set.password ??
    crypto.randomUUID().replaceAll("-", "").slice(0, 16);

  await user.findOneAndUpdate({
    filter: { _id: userId },
    update: {
      $set: { password: await hash(password), updatedAt: new Date() },
    },
    projection: { _id: 1 },
  });

  await recordAudit({
    action: "user.resetPassword",
    targetType: "user",
    targetId: String(userId),
    summary: `Reset the password for ${target!.email}`,
    metadata: { email: target!.email, generated },
  });

  return pickByGet(
    { userId: String(userId), password, generated },
    body.details.get,
  );
};
