import { type ActFn, ObjectId } from "lesan";
import { coreApp, onlineCollection } from "../../../mod.ts";
import { type MyContext } from "@lib";

export const removeOnlineCollectionFn: ActFn = async (body) => {
  const { set } = body.details;
  const { user }: MyContext = coreApp.contextFns.getContextModel() as MyContext;

  // Derived exactly as `saveOnlineCollection` derives it.
  const clientId = `${set.sourceId}:${set.externalId}`;

  const existing = await onlineCollection.findOne({
    filters: { clientId, "user._id": new ObjectId(user._id) },
    projection: { _id: 1 },
  });

  // Removing something that is not there is a success, not an error: the
  // listener asked for it to be gone and it is. Reporting a failure would only
  // make a device retry a delete that has already happened.
  if (!existing) {
    return { success: true };
  }

  await onlineCollection.deleteOne({ filter: { _id: existing._id } });

  return { success: true };
};
