import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminListUsersFn } from "./adminListUsers.fn.ts";
import { adminListUsersValidator } from "./adminListUsers.val.ts";

export const adminListUsersSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "adminListUsers",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminListUsersValidator(),
    fn: adminListUsersFn,
  });
