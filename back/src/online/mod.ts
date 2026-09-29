import { getMyOnlineCollectionsSetup } from "./getMyOnlineCollections/mod.ts";
import { removeOnlineCollectionSetup } from "./removeOnlineCollection/mod.ts";
import { saveOnlineCollectionSetup } from "./saveOnlineCollection/mod.ts";

export const onlineSetup = () => {
  saveOnlineCollectionSetup();
  getMyOnlineCollectionsSetup();
  removeOnlineCollectionSetup();
};
