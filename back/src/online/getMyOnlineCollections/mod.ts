import { setTokens, setUser } from "@lib";
import { coreApp } from "../../../mod.ts";
import { getMyOnlineCollectionsFn } from "./getMyOnlineCollections.fn.ts";
import { getMyOnlineCollectionsValidator } from "./getMyOnlineCollections.val.ts";

export const getMyOnlineCollectionsSetup = () =>
  coreApp.acts.setAct({
    schema: "onlineCollection",
    fn: getMyOnlineCollectionsFn,
    actName: "getMyOnlineCollections",
    preAct: [setTokens, setUser],
    validator: getMyOnlineCollectionsValidator(),
  });
