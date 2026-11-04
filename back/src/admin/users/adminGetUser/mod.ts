import { coreApp } from "../../../../mod.ts";
import { requireSupport, setTokens, setUser } from "@lib";
import { adminGetUserFn } from "./adminGetUser.fn.ts";
import { adminGetUserValidator } from "./adminGetUser.val.ts";

export const adminGetUserSetup = () =>
  coreApp.acts.setAct({
    schema: "user",
    actName: "adminGetUser",
    preAct: [setTokens, setUser, requireSupport],
    validator: adminGetUserValidator(),
    fn: adminGetUserFn,
  });
