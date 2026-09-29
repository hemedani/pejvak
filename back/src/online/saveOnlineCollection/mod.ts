import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { saveOnlineCollectionFn } from "./saveOnlineCollection.fn.ts";
import { saveOnlineCollectionValidator } from "./saveOnlineCollection.val.ts";

export const saveOnlineCollectionSetup = () =>
  coreApp.acts.setAct({
    schema: "onlineCollection",
    fn: saveOnlineCollectionFn,
    actName: "saveOnlineCollection",
    preAct: [setTokens, setUser],
    validator: saveOnlineCollectionValidator(),
  });
