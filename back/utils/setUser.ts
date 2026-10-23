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

  // Every act only needs the authenticated id. Projecting the whole user would
  // also pull the password hash into the request context for no reason.
  const foundedUser = await user.findOne({
    filters: { _id: new ObjectId(tokenUser._id) },
    projection: { _id: 1 },
  });

  !foundedUser && throwError("user not exist");

  coreApp.contextFns.setContext({ user: foundedUser });
};
