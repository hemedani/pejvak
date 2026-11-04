import { ObjectId } from "lesan";
import { coreApp, user } from "../mod.ts";
import type { MyContext } from "./context.ts";
import { throwError } from "./throwError.ts";

export const setUser = async () => {
  const ctx = coreApp.contextFns.getContextModel() as MyContext;
  const tokenUser = ctx.user;

  if (!tokenUser || !tokenUser._id) {
    throwError("Invalid or missing token data");
  }

  // Project only what acts actually read: the id, the fields that decide what
  // the account may do, the reason a suspended account is read-only (it is
  // shown to the listener, not just to an admin), and the email an audit line
  // is written with. Projecting the whole user would pull the password hash
  // into the request context for no reason.
  const foundedUser = await user.findOne({
    filters: { _id: new ObjectId(tokenUser._id) },
    projection: {
      _id: 1,
      role: 1,
      status: 1,
      suspendedReason: 1,
      email: 1,
    },
  });

  !foundedUser && throwError("user not exist");

  if (foundedUser!.status === "deleted") {
    throwError("This account has been deleted");
  }

  // Accounts created before `role`/`status` existed carry neither field. Fill
  // them in here so no act has to re-derive a default, while `roleOf` and
  // `statusOf` stay a safety net rather than the only source of truth.
  coreApp.contextFns.setContext({
    user: {
      ...foundedUser,
      role: foundedUser!.role ?? "user",
      status: foundedUser!.status ?? "active",
    },
  });
};
