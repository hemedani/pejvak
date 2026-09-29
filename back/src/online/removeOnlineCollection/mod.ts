import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { removeOnlineCollectionFn } from "./removeOnlineCollection.fn.ts";
import { removeOnlineCollectionValidator } from "./removeOnlineCollection.val.ts";

export const removeOnlineCollectionSetup = () =>
  coreApp.acts.setAct({
    schema: "onlineCollection",
    fn: removeOnlineCollectionFn,
    actName: "removeOnlineCollection",
    preAct: [setTokens, setUser],
    validator: removeOnlineCollectionValidator(),
  });
