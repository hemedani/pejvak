import type { ActFn } from "lesan";
import { hash } from "@da/bcrypt";
import { coreApp, user } from "../../../mod.ts";
import { createToken, throwError } from "@lib";

/**
 * Creates the first admin, and only the first.
 *
 * The guard is "no admin exists", not "no user exists": a database that already
 * has listeners can still appoint its first operator. That is a deliberate
 * bootstrap window, so keep the endpoint unavailable to the public until setup
 * is finished; the first admin closes it, and it can never promote a listener
 * afterwards. A database that already has an admin uses the panel, not this act.
 *
 * Returning a token makes setup one call: the operator can use the new account
 * immediately, then create their real identity from the panel if they prefer.
 */
export const createFirstAdminFn: ActFn = async (body) => {
  const { set, get } = body.details;

  const existingAdmin = await user.findOne({
    filters: { role: "admin" },
    projection: { _id: 1 },
  });
  if (existingAdmin) {
    throwError(
      "This setup action is only available before the first admin account is created",
    );
  }

  const emailTaken = await user.findOne({
    filters: { email: set.email },
    projection: { _id: 1 },
  });
  if (emailTaken) {
    throwError(
      "A user with this email already exists. Use an existing admin or `deno task seed` to promote it, or choose another email.",
    );
  }

  const now = new Date();
  const created = await user.insertOne({
    doc: {
      username: set.username,
      email: set.email,
      password: await hash(set.password),
      ...(set.displayName !== undefined
        ? { displayName: set.displayName }
        : {}),
      role: "admin",
      status: "active",
      createdAt: now,
      updatedAt: now,
    },
    projection: { _id: 1, username: 1, email: 1 },
  });
  if (!created) throwError("Admin was not created");

  const token = await createToken({
    _id: created!._id,
    username: set.username,
    email: set.email,
  });

  // Mirror `register`: an empty projection would return the whole document,
  // including the password hash, so fall back to every safe pure field and then
  // delete the hash defensively even from an exclusion projection.
  const requestedUser = get?.user ?? {};
  const userProjection = Object.keys(requestedUser).length > 0
    ? requestedUser
    : coreApp.schemas.createProjection("user", "Pure");

  const admin = await user.findOne({
    filters: { _id: created!._id },
    projection: userProjection,
  });

  if (admin) delete admin.password;

  return { token, user: admin };
};
